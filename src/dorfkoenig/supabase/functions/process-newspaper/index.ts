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
import { openrouter } from '../_shared/openrouter.ts';
import { firecrawl } from '../_shared/firecrawl.ts';
import {
  buildNewspaperExtractionPrompt,
  preprocessMarkdown,
  chunkNewspaperMarkdown,
  isLikelyJunkChunk,
  type ExtractionResult,
  type ExtractionUnit,
} from '../_shared/zeitung-extraction-prompt.ts';
import { assignVillage } from '../_shared/village-assignment.ts';
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
      await updateJob(supabase, jobId, { status: 'failed', error_message: 'Duplicate upload already processing' });
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
    await updateJob(supabase, jobId, { stage: 'parsing_pdf' });
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
    await updateJob(supabase, jobId, { stage: 'chunking' });
    const cleaned = preprocessMarkdown(scrapeResult.markdown);

    // ── Step 4: Chunk ──
    const allChunks = chunkNewspaperMarkdown(cleaned);

    // ── Step 5: Pre-filter junk ──
    const validChunks = allChunks.filter((c) => !isLikelyJunkChunk(c));
    console.log(`[process-newspaper] ${allChunks.length} chunks, ${validChunks.length} after junk filter`);

    // Update job with chunk counts
    await updateJob(supabase, jobId, {
      stage: 'extracting',
      chunks_total: validChunks.length,
      chunks_processed: 0,
    });

    // ── Step 6: LLM extraction (parallel with concurrency limit) ──
    const { system, buildUserMessage } = buildNewspaperExtractionPrompt(VILLAGES, publicationDate);

    const allUnits: ExtractionUnit[] = [];
    const allSkipped: string[] = [];

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
        if (result.units) allUnits.push(...result.units);
        if (result.skipped) allSkipped.push(...result.skipped);
      } catch (err) {
        console.error(`[process-newspaper] Chunk ${index + 1} extraction failed:`, err);
      }

      // Update progress after each chunk
      await updateJob(supabase, jobId!, {
        chunks_processed: index + 1,
      });
    }, LLM_CONCURRENCY);

    console.log(`[process-newspaper] Extracted ${allUnits.length} raw units, ${allSkipped.length} skipped items`);

    // ── Step 7: Post-process ──

    // 7a. Require eventDate. Resolve each unit's village through assignVillage
    //     (or the legacy VILLAGE_ID_MAP filter on the rollback path).
    const dated = allUnits.filter((u) => u.eventDate);
    interface ResolvedUnit {
      unit: ExtractionUnit;
      villageId: string | null;
      confidence: 'high' | 'medium' | 'low' | null;
      assignmentPath: string | null;
      reviewRequired: boolean;
    }

    let resolved: ResolvedUnit[];
    if (USE_LEGACY_VILLAGE_MAP) {
      resolved = dated
        .filter((u) => u.village && VILLAGE_ID_MAP[u.village])
        .map((u) => ({
          unit: u,
          villageId: VILLAGE_ID_MAP[u.village!],
          confidence: null,
          assignmentPath: null,
          reviewRequired: false,
        }));
    } else {
      resolved = dated.map((u) => {
        const a = assignVillage({
          village: u.village,
          villageConfidence: u.villageConfidence,
          villageEvidence: u.villageEvidence,
          statement: u.statement,
        });
        return {
          unit: u,
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
    const stagedUnits = resolved.map((r) => ({
      uid: crypto.randomUUID(),
      statement: r.unit.statement,
      unit_type: r.unit.unitType || 'fact',
      entities: r.unit.entities || [],
      event_date: r.unit.eventDate || null,
      location: r.villageId ? { city: r.villageId, country: 'Schweiz' } : null,
      village_confidence: r.confidence,
      assignment_path: r.assignmentPath,
      review_required: r.reviewRequired,
      evidence: r.unit.villageEvidence ?? undefined,
    }));

    if (stagedUnits.length === 0) {
      // Nothing to review — close the job immediately so the UI shows "0 Einheiten".
      await updateJob(supabase, jobId, {
        status: 'completed',
        units_created: 0,
        skipped_items: allSkipped.slice(0, 50),
        completed_at: new Date().toISOString(),
      });
      return jsonResponse({ data: { units_created: 0 } });
    }

    await updateJob(supabase, jobId, {
      status: 'review_pending',
      extracted_units: stagedUnits,
      skipped_items: allSkipped.slice(0, 50),
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
      await updateJob(supabase, jobId, {
        status: 'failed',
        error_message: (error as Error).message || 'Unbekannter Fehler',
        completed_at: new Date().toISOString(),
      });
    }
    return errorResponse('Processing failed', 500);
  }
});

// ── Helpers ───────────────────────────────────────────────────

async function updateJob(
  supabase: ReturnType<typeof createServiceClient>,
  jobId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('newspaper_jobs')
    .update(updates)
    .eq('id', jobId);

  if (error) {
    console.error(`[process-newspaper] Failed to update job ${jobId}:`, error);
  }
}

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
