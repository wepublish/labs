/**
 * @module process-newspaper
 * Async newspaper PDF extraction pipeline.
 * Triggered by manual-upload (pdf_confirm) via service role fetch.
 * Parses PDF → chunks → LLM extraction → resolves village per unit → stages
 * units on newspaper_jobs.extracted_units and sets status=review_pending.
 * The manual-upload edge function's `pdf_finalize` branch handles embed /
 * dedup / insert on the user-selected subset.
 */

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase-client.ts';
import { requireInternalRequest } from '../_shared/internal-auth.ts';
import { openrouter } from '../_shared/openrouter.ts';
import { firecrawl } from '../_shared/firecrawl.ts';
import {
  buildNewspaperExtractionPrompt,
  chunkNewspaperMarkdown,
  classifyEventDate,
  type ExtractionResult,
  type ExtractionUnit,
  isLikelyJunkChunk,
  preprocessMarkdown,
} from '../_shared/zeitung-extraction-prompt.ts';
import { assignVillage } from '../_shared/village-assignment.ts';
import { sanitizeReviewUnit } from '../_shared/manual-upload-review.ts';
import { normalizeCity } from '../_shared/village-id.ts';
import {
  incrementProcessingAttempt,
  updateNewspaperJob,
} from '../_shared/newspaper-job-state.ts';
import gemeinden from '../_shared/gemeinden.json' with { type: 'json' };

// Display names used in the extraction prompt.
const VILLAGES = gemeinden.map((g: { name: string }) => g.name);

// Legacy name→id map, only used when PDF_USE_LEGACY_VILLAGE_MAP is set for rollback.
const VILLAGE_ID_MAP: Record<string, string> = Object.fromEntries(
  gemeinden.map((g: { id: string; name: string }) => [g.name, g.id])
);

// Rollback switch. Default (unset/false) uses the shared assignVillage() ladder,
// which writes village_confidence + assignment_path + review_required and
// preserves units whose village the LLM hallucinated. Setting to 'true' restores
// the pre-2026-04-16 behaviour (drop units whose village isn't in the 10-set).
const USE_LEGACY_VILLAGE_MAP = Deno.env.get('PDF_USE_LEGACY_VILLAGE_MAP') === 'true';

const LLM_CONCURRENCY = 3;
const FIRECRAWL_TIMEOUT = 120000;
const SIGNED_URL_EXPIRY = 3600;

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  const authError = requireInternalRequest(req);
  if (authError) return authError;

  const supabase = createServiceClient();

  let jobId: string | undefined;

  try {
    const body = await req.json();
    jobId = body.job_id as string;
    const storagePath = body.storage_path as string;
    const userId = body.user_id as string;
    const publicationDate = (body.publication_date as string) || new Date().toISOString().slice(0, 10);
    const label = (body.label as string) || null;

    if (!jobId || !storagePath || !userId) {
      return errorResponse('Missing required fields', 400);
    }

    const { data: job, error: jobError } = await supabase
      .from('newspaper_jobs')
      .select('id, user_id, storage_path')
      .eq('id', jobId)
      .maybeSingle();

    if (jobError) {
      console.error('[process-newspaper] Job lookup failed:', jobError);
      return errorResponse('Job lookup failed', 500);
    }
    if (!job) {
      return errorResponse('Job not found', 404);
    }
    if (job.user_id !== userId || job.storage_path !== storagePath) {
      console.error('[process-newspaper] Job ownership mismatch', { jobId });
      return errorResponse('Forbidden', 403, 'FORBIDDEN');
    }

    await incrementProcessingAttempt(supabase, jobId);

    // ── Duplicate guard ──
    const { data: existingJob } = await supabase
      .from('newspaper_jobs')
      .select('id')
      .eq('storage_path', storagePath)
      .eq('status', 'processing')
      .neq('id', jobId)
      .limit(1)
      .single();

    if (existingJob) {
      console.log(`[process-newspaper] Duplicate processing for ${storagePath}, skipping`);
      await updateNewspaperJob(supabase, jobId, { status: 'failed', error_message: 'Duplicate upload already processing' });
      return jsonResponse({ data: { skipped: true, reason: 'duplicate' } });
    }

    // ── Step 1: Get signed download URL ──
    console.log(`[process-newspaper] Starting for job=${jobId}, path=${storagePath}`);
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('uploads')
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRY);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw new Error(`Signed URL failed: ${signedUrlError?.message || 'unknown'}`);
    }

    // ── Step 2: Firecrawl parse (Fire-PDF `fast` = pure text extraction) ──
    // Default `auto` mis-classifies InDesign-export newspapers as needing OCR,
    // then the vision model hallucinates (wrong dates, gibberish, looped phrases).
    // Benchmark 2026-04-15 on Riehener Zeitung: fast 41 section markers vs auto 4,
    // zero hallucinations vs 6. Newspapers always have embedded text so OCR is
    // unnecessary.
    await updateNewspaperJob(supabase, jobId, { status: 'processing', stage: 'parsing_pdf' });
    console.log(`[process-newspaper] Parsing PDF via Firecrawl (fast mode)...`);
    const scrapeResult = await firecrawl.scrape({
      url: signedUrlData.signedUrl,
      formats: ['markdown'],
      timeout: FIRECRAWL_TIMEOUT,
      pdfMode: 'fast',
    });

    if (!scrapeResult.success || !scrapeResult.markdown) {
      throw new Error(`Firecrawl failed: ${scrapeResult.error || 'no markdown returned'}`);
    }

    console.log(`[process-newspaper] Parsed ${scrapeResult.markdown.length} chars`);

    // ── Step 3: Preprocess ──
    await updateNewspaperJob(supabase, jobId, { status: 'processing', stage: 'chunking' });
    const cleaned = preprocessMarkdown(scrapeResult.markdown);

    // ── Step 4: Chunk ──
    const allChunks = chunkNewspaperMarkdown(cleaned);

    // ── Step 5: Pre-filter junk ──
    const validChunks = allChunks.filter((c) => !isLikelyJunkChunk(c));
    console.log(`[process-newspaper] ${allChunks.length} chunks, ${validChunks.length} after junk filter`);

    // Update job with chunk counts
    await updateNewspaperJob(supabase, jobId, {
      status: 'processing',
      stage: 'extracting',
      chunks_total: validChunks.length,
      chunks_processed: 0,
    });

    // ── Step 6: LLM extraction (parallel with concurrency limit) ──
    const { system, buildUserMessage } = buildNewspaperExtractionPrompt(VILLAGES, publicationDate);

    // Keep the source chunk per unit so we can later classify whether the
    // LLM's eventDate is actually anchored in the text it was given.
    interface UnitWithSource {
      unit: ExtractionUnit;
      chunk: string;
    }
    const allUnits: UnitWithSource[] = [];
    const allSkipped: string[] = [];
    let completedChunks = 0;

    await processWithConcurrency(validChunks, async (chunk, index) => {
      try {
        const response = await openrouter.chat({
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: buildUserMessage(chunk) },
          ],
          temperature: 0.1,
          max_tokens: 4000,
          response_format: { type: 'json_object' },
        });

        const result: ExtractionResult = JSON.parse(response.choices[0].message.content);
        if (result.units) {
          for (const unit of result.units) allUnits.push({ unit, chunk });
        }
        if (result.skipped) allSkipped.push(...result.skipped);
      } catch (err) {
        console.error(`[process-newspaper] Chunk ${index + 1} extraction failed:`, err);
      }

      // Update progress after each chunk
      completedChunks += 1;
      await updateNewspaperJob(supabase, jobId!, {
        status: 'processing',
        stage: 'extracting',
        chunks_total: validChunks.length,
        chunks_processed: completedChunks,
      });
    }, LLM_CONCURRENCY);

    console.log(`[process-newspaper] Extracted ${allUnits.length} raw units, ${allSkipped.length} skipped items`);

    // ── Step 7: Post-process ──

    // 7a. Require eventDate in the present or future. Past-dated events are
    //     noise for the forward-looking newsletter; drop them here. Resolve
    //     each remaining unit's village through assignVillage (or the legacy
    //     VILLAGE_ID_MAP filter on the rollback path).
    const dated = allUnits.filter((u) => !u.unit.eventDate || u.unit.eventDate >= publicationDate);
    interface ResolvedUnit {
      unit: ExtractionUnit;
      chunk: string;
      villageId: string | null;
      confidence: 'high' | 'medium' | 'low' | null;
      assignmentPath: string | null;
      reviewRequired: boolean;
    }

    let resolved: ResolvedUnit[];
    if (USE_LEGACY_VILLAGE_MAP) {
      resolved = dated
        .filter((w) => w.unit.village && VILLAGE_ID_MAP[w.unit.village])
        .map((w) => ({
          unit: w.unit,
          chunk: w.chunk,
          villageId: VILLAGE_ID_MAP[w.unit.village!],
          confidence: null,
          assignmentPath: null,
          reviewRequired: false,
        }));
    } else {
      resolved = dated.map((w) => {
        const a = assignVillage({
          village: w.unit.village,
          villageConfidence: w.unit.villageConfidence,
          villageEvidence: w.unit.villageEvidence,
          statement: w.unit.statement,
        });
        return {
          unit: w.unit,
          chunk: w.chunk,
          villageId: a.villageId,
          confidence: a.confidence,
          assignmentPath: a.assignmentPath,
          reviewRequired: a.reviewRequired,
        };
      });
    }

    console.log(
      `[process-newspaper] ${resolved.length} units after resolve (legacy=${USE_LEGACY_VILLAGE_MAP})`,
    );

    // ── Step 7b: Shape for review and hand off to the UI ──
    //
    // Stamp each unit with a UUID so the UI can submit selection by uid
    // rather than array index (keeps edit-in-place unblocked for v2).
    // No embeddings in extracted_units — regenerated at finalize time to
    // keep the JSONB payload small.
    const stagedUnits = resolved.flatMap((r) => {
      const sanitized = sanitizeReviewUnit({
        uid: crypto.randomUUID(),
        statement: r.unit.statement,
        unit_type: r.unit.unitType || 'fact',
        entities: r.unit.entities || [],
        event_date: r.unit.eventDate || null,
        date_confidence: r.unit.eventDate ? classifyEventDate(r.unit.eventDate, r.chunk) : null,
        location: r.villageId ? { city: normalizeCity(r.villageId), country: 'Schweiz' } : null,
        village_confidence: r.confidence,
        assignment_path: r.assignmentPath,
        review_required: r.reviewRequired,
        evidence: r.unit.villageEvidence ?? undefined,
      });

      if (!sanitized) {
        console.warn('[process-newspaper] dropped malformed staged unit', {
          statement: r.unit.statement.slice(0, 120),
          village: r.unit.village,
        });
        return [];
      }

      return [sanitized];
    });

    if (stagedUnits.length === 0) {
      // Nothing to review — close the job immediately so the UI shows "0 Einheiten".
      await updateNewspaperJob(supabase, jobId, {
        status: 'completed',
        units_created: 0,
        skipped_items: allSkipped.slice(0, 50),
        chunks_total: validChunks.length,
        chunks_processed: validChunks.length,
      });
      return jsonResponse({ data: { units_created: 0 } });
    }

    await updateNewspaperJob(supabase, jobId, {
      status: 'review_pending',
      extracted_units: stagedUnits,
      skipped_items: allSkipped.slice(0, 50),
      chunks_total: validChunks.length,
      chunks_processed: validChunks.length,
    });

    console.log(
      `[process-newspaper] Review pending for job=${jobId} with ${stagedUnits.length} staged units`,
    );
    return jsonResponse({
      data: { status: 'review_pending', staged: stagedUnits.length },
    });

  } catch (error) {
    console.error('[process-newspaper] Fatal error:', error);
    if (jobId) {
      const supabase = createServiceClient();
      await updateNewspaperJob(supabase, jobId, {
        status: 'failed',
        error_message: (error as Error).message || 'Unbekannter Fehler',
      });
    }
    return errorResponse('Processing failed', 500);
  }
});

// ── Helpers ───────────────────────────────────────────────────

async function processWithConcurrency<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void>,
  concurrency: number,
): Promise<void> {
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      await fn(items[index], index);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
}
