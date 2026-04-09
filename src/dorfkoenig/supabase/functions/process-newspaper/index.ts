/**
 * @module process-newspaper
 * Async newspaper PDF processing pipeline.
 * Triggered by manual-upload (pdf_confirm) via service role fetch.
 * Parses PDF → chunks → LLM extraction → dedup → store units.
 * Updates newspaper_jobs row for Realtime progress tracking.
 */

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase-client.ts';
import { openrouter } from '../_shared/openrouter.ts';
import { embeddings } from '../_shared/embeddings.ts';
import { firecrawl } from '../_shared/firecrawl.ts';
import { UNIT_DEDUP_THRESHOLD } from '../_shared/constants.ts';
import {
  buildNewspaperExtractionPrompt,
  preprocessMarkdown,
  chunkNewspaperMarkdown,
  isLikelyJunkChunk,
  type ExtractionResult,
  type ExtractionUnit,
} from '../_shared/zeitung-extraction-prompt.ts';
import gemeinden from '../_shared/gemeinden.json' with { type: 'json' };

// Derived from gemeinden.json — the LLM assigns units to village names,
// VILLAGE_ID_MAP resolves them to IDs for location JSONB.
const VILLAGES = gemeinden.map((g: { name: string }) => g.name);
const VILLAGE_ID_MAP: Record<string, string> = Object.fromEntries(
  gemeinden.map((g: { id: string; name: string }) => [g.name, g.id])
);

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

    // ── Step 2: Firecrawl parse ──
    console.log(`[process-newspaper] Parsing PDF via Firecrawl...`);
    const scrapeResult = await firecrawl.scrape({
      url: signedUrlData.signedUrl,
      formats: ['markdown'],
      timeout: FIRECRAWL_TIMEOUT,
    });

    if (!scrapeResult.success || !scrapeResult.markdown) {
      throw new Error(`Firecrawl failed: ${scrapeResult.error || 'no markdown returned'}`);
    }

    console.log(`[process-newspaper] Parsed ${scrapeResult.markdown.length} chars`);

    // ── Step 3: Preprocess ──
    const cleaned = preprocessMarkdown(scrapeResult.markdown);

    // ── Step 4: Chunk ──
    const allChunks = chunkNewspaperMarkdown(cleaned);

    // ── Step 5: Pre-filter junk ──
    const validChunks = allChunks.filter((c) => !isLikelyJunkChunk(c));
    console.log(`[process-newspaper] ${allChunks.length} chunks, ${validChunks.length} after junk filter`);

    // Update job with chunk counts
    await updateJob(supabase, jobId, {
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

    // 7a. Filter out units without date or village
    const villageUnits = allUnits.filter(
      (u) => u.eventDate && u.village && VILLAGE_ID_MAP[u.village]
    );
    console.log(`[process-newspaper] ${villageUnits.length} units after village filter`);

    if (villageUnits.length === 0) {
      await updateJob(supabase, jobId, {
        status: 'completed',
        units_created: 0,
        skipped_items: allSkipped.slice(0, 50),
        completed_at: new Date().toISOString(),
      });
      return jsonResponse({ data: { units_created: 0 } });
    }

    // 7b. Generate embeddings
    const statements = villageUnits.map((u) => u.statement);
    const unitEmbeddings = await embeddings.generateBatch(statements);

    // 7c. Deduplicate within batch (0.75 threshold)
    const uniqueIndices = embeddings.deduplicateFromEmbeddings(unitEmbeddings, UNIT_DEDUP_THRESHOLD);

    // 7d. Per-village dedup against existing units in DB (parallel)
    const dedupResults = await Promise.all(
      uniqueIndices.map(async (i) => {
        const unit = villageUnits[i];
        const villageId = VILLAGE_ID_MAP[unit.village!];

        const { data: similar } = await supabase.rpc('search_units_semantic', {
          user_id: userId,
          embedding: unitEmbeddings[i],
          location_city: villageId,
          min_similarity: UNIT_DEDUP_THRESHOLD,
          limit: 1,
        });

        return { index: i, isDuplicate: similar && similar.length > 0 };
      })
    );
    const finalIndices = dedupResults
      .filter((r) => !r.isDuplicate)
      .map((r) => r.index);

    console.log(`[process-newspaper] ${finalIndices.length} units after dedup (from ${villageUnits.length})`);

    // ── Step 8: Store units (batched insert) ──
    let storedCount = 0;
    if (finalIndices.length > 0) {
      const rows = finalIndices.map((i) => {
        const unit = villageUnits[i];
        const villageId = VILLAGE_ID_MAP[unit.village!];
        return {
          user_id: userId,
          scout_id: null,
          execution_id: null,
          statement: unit.statement,
          unit_type: unit.unitType || 'fact',
          entities: unit.entities || [],
          source_url: 'manual://pdf',
          source_domain: 'manual',
          source_title: label,
          location: { city: villageId, country: 'Schweiz' },
          topic: 'Wochenblatt',
          source_type: 'manual_pdf',
          file_path: storagePath,
          embedding: unitEmbeddings[i],
          event_date: unit.eventDate || null,
        };
      });

      const { error, count } = await supabase
        .from('information_units')
        .insert(rows, { count: 'exact' });

      storedCount = error ? 0 : (count ?? rows.length);
    }

    // ── Step 9: Complete ──
    await updateJob(supabase, jobId, {
      status: 'completed',
      units_created: storedCount,
      skipped_items: allSkipped.slice(0, 50),
      completed_at: new Date().toISOString(),
    });

    console.log(`[process-newspaper] Done. Stored ${storedCount} units.`);
    return jsonResponse({ data: { units_created: storedCount } });

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
