/**
 * @module execute-civic-scout
 * Execution pipeline for civic scouts: fetch tracked council pages, detect new documents,
 * extract promises, store them, and generate information units for Compose.
 * POST: triggered by pg_cron dispatch or manual run. Auth: service role or x-user-id.
 */

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient, type Scout } from '../_shared/supabase-client.ts';
import { requireInternalRequest } from '../_shared/internal-auth.ts';
import { upsertCanonicalUnit } from '../_shared/canonical-units.ts';
import { embeddings } from '../_shared/embeddings.ts';
import { firecrawl } from '../_shared/firecrawl.ts';
import { resend } from '../_shared/resend.ts';
import { extractInformationUnits } from '../_shared/unit-extraction.ts';
import { updateExecutionFailed } from '../_shared/execution-helpers.ts';
import { MAX_DOCS_PER_RUN, PROCESSED_URLS_CAP } from '../_shared/civic-constants.ts';
import {
  PRIMARY_EXTRACTION_TIMEOUT_MS,
  PRIMARY_PAGE_SCRAPE_TIMEOUT_MS,
} from '../_shared/constants.ts';
import {
  extractLinksFromHtml,
  classifyMeetingUrls,
  extractPromises,
  filterPromises,
  extractDateFromUrl,
  type ExtractedPromise,
} from '../_shared/civic-utils.ts';

const ADMIN_EMAILS = (Deno.env.get('ADMIN_EMAILS') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Short delay between Firecrawl calls within a single execution (2s).
 *  The main rate-limit protection is the 20s pg_cron stagger between scouts. */
const INTRA_DELAY_MS = 2000;
function shortDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, INTRA_DELAY_MS));
}

interface ExecuteRequest {
  scoutId: string;
  executionId?: string;
  skipNotification?: boolean;
  extractUnits?: boolean;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const authError = requireInternalRequest(req);
  if (authError) return authError;

  const startTime = Date.now();
  const supabase = createServiceClient();
  let executionId: string | undefined;
  let scout: Scout | null = null;

  try {
    const body: ExecuteRequest = await req.json();
    const { scoutId, skipNotification = false, extractUnits = true } = body;
    executionId = body.executionId;

    if (!scoutId) {
      return errorResponse('Scout ID erforderlich', 400);
    }

    // Fetch scout
    const { data: fetchedScout, error: scoutError } = await supabase
      .from('scouts')
      .select('*')
      .eq('id', scoutId)
      .single();

    if (scoutError || !fetchedScout) {
      return errorResponse('Scout nicht gefunden', 404);
    }
    scout = fetchedScout;

    if (scout.scout_type !== 'civic') {
      return errorResponse('Kein Civic Scout', 400);
    }

    if (!scout.tracked_urls || scout.tracked_urls.length === 0) {
      return errorResponse('Keine überwachten URLs konfiguriert', 400);
    }

    // Create execution record if not provided
    if (!executionId) {
      const { data: running } = await supabase
        .from('scout_executions')
        .select('id')
        .eq('scout_id', scoutId)
        .eq('status', 'running')
        .gte('started_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
        .single();

      if (running) {
        return errorResponse('Eine Ausführung läuft bereits', 409, 'EXECUTION_RUNNING');
      }

      const { data: newExec, error: execError } = await supabase
        .from('scout_executions')
        .insert({
          scout_id: scoutId,
          user_id: scout.user_id,
          status: 'running',
        })
        .select()
        .single();

      if (execError) {
        console.error('Create execution error:', execError);
        return errorResponse('Fehler beim Erstellen der Ausführung', 500);
      }

      executionId = newExec.id;
    }

    console.log(`[${executionId}] Starting civic execution for scout: ${scout.name}`);

    // =========================================================================
    // STEP 1: FETCH TRACKED URLS + COMPUTE CONTENT HASH
    // =========================================================================

    let allHtml = '';
    let allLinks: [string, string][] = [];

    for (let i = 0; i < scout.tracked_urls.length; i++) {
      if (i > 0) await shortDelay();

      const pageUrl = scout.tracked_urls[i];
      console.log(`[${executionId}] Fetching tracked URL: ${pageUrl}`);
      const result = await firecrawl.scrapeRawHtml(pageUrl);

      if (!result.success || !result.html) {
        console.warn(`[${executionId}] Failed to fetch ${pageUrl}: ${result.error}`);
        continue;
      }

      allHtml += result.html;
      const links = extractLinksFromHtml(result.html, pageUrl);
      allLinks = allLinks.concat(links);
    }

    if (allHtml.length === 0) {
      console.error(`[${executionId}] All tracked URLs failed to fetch`);
      await updateExecutionFailed(supabase, executionId, scout, 'Alle überwachten URLs konnten nicht abgerufen werden');
      return jsonResponse({
        data: { execution_id: executionId, status: 'failed', error: 'Fetch failed' },
      });
    }

    const contentHash = await firecrawl.computeContentHash(allHtml);
    const scrapeDurationMs = Date.now() - startTime;

    // =========================================================================
    // STEP 2: CHECK CHANGES (hash-based)
    // =========================================================================

    if (contentHash === scout.content_hash) {
      console.log(`[${executionId}] No changes detected (hash match)`);

      await supabase
        .from('scout_executions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          change_status: 'same',
          summary_text: 'Keine Änderungen erkannt',
          scrape_duration_ms: scrapeDurationMs,
        })
        .eq('id', executionId);

      await supabase
        .from('scouts')
        .update({ last_run_at: new Date().toISOString(), consecutive_failures: 0 })
        .eq('id', scoutId);

      return jsonResponse({
        data: {
          execution_id: executionId,
          status: 'completed',
          change_status: 'same',
          promises_found: 0,
          units_extracted: 0,
          duration_ms: Date.now() - startTime,
        },
      });
    }

    const isFirstRun = !scout.content_hash;

    // =========================================================================
    // STEP 3: CLASSIFY NEW DOCUMENT LINKS
    // =========================================================================

    await shortDelay();
    const meetingUrls = await classifyMeetingUrls(allLinks);
    console.log(`[${executionId}] Classified ${meetingUrls.length} meeting URL(s)`);

    // =========================================================================
    // STEP 4: FILTER OUT ALREADY-PROCESSED URLS
    // =========================================================================

    const processedUrls: string[] = scout.processed_pdf_urls || [];
    const processedSet = new Set(processedUrls);
    const newDocUrls = meetingUrls.filter((u) => !processedSet.has(u));

    // =========================================================================
    // STEP 5: CAP AT MAX_DOCS_PER_RUN
    // =========================================================================

    const batch = newDocUrls.slice(0, MAX_DOCS_PER_RUN);

    // =========================================================================
    // STEP 6: PARSE DOCS AND EXTRACT PROMISES
    // =========================================================================

    const allPromises: ExtractedPromise[] = [];
    const successfulUrls: string[] = [];
    let totalUnitsExtracted = 0;
    let mergedExistingCount = 0;

    for (let i = 0; i < batch.length; i++) {
      await shortDelay();
      const docUrl = batch[i];

      // Council-minutes PDFs are always InDesign/PDF-export with embedded text,
      // so force `fast` mode to skip Fire-PDF's OCR mis-classification (same
      // rationale as process-newspaper). If a URL turns out to be a scanned
      // document we'll just get minimal text and log zero units — acceptable.
      console.log(`[${executionId}] Parsing document: ${docUrl}`);
      const scrapeResult = await firecrawl.scrape({
        url: docUrl,
        formats: ['markdown'],
        timeout: PRIMARY_PAGE_SCRAPE_TIMEOUT_MS,
        pdfMode: 'fast',
      });

      if (!scrapeResult.success || !scrapeResult.markdown) {
        console.warn(`[${executionId}] Failed to parse ${docUrl}: ${scrapeResult.error}`);
        continue;
      }

      successfulUrls.push(docUrl);

      // Extract promises
      const sourceDate = extractDateFromUrl(docUrl);
      const promises = await extractPromises(
        scrapeResult.markdown,
        docUrl,
        scrapeResult.title,
        sourceDate,
        scout.criteria || undefined,
      );
      allPromises.push(...promises);

      // Extract information units (for Compose panel)
      const locationMode = (scout.location_mode as 'manual' | 'auto' | null) ?? 'manual';
      const hasScope = locationMode === 'auto' || scout.location || scout.topic;

      if (extractUnits && hasScope) {
        try {
          const docContentHash = await firecrawl.computeContentHash(scrapeResult.markdown);
          const { insertedCount, mergedExistingCount: extractionMerges } = await extractInformationUnits(supabase, scrapeResult.markdown, {
            scoutId: scout.id,
            userId: scout.user_id,
            executionId: executionId!,
            sourceUrl: docUrl,
            location: scout.location,
            topic: scout.topic,
            locationMode,
            criteria: scout.criteria,
            contentHash: docContentHash,
            extractionTimeoutMs: PRIMARY_EXTRACTION_TIMEOUT_MS,
          });
          totalUnitsExtracted += insertedCount;
          mergedExistingCount += extractionMerges;
        } catch (error) {
          console.error(`[${executionId}] Unit extraction failed for ${docUrl}:`, error);
        }
      }
    }

    // =========================================================================
    // STEP 7: FILTER AND STORE PROMISES
    // =========================================================================

    const filtered = filterPromises(allPromises, !!scout.criteria);

    if (filtered.length > 0) {
      const promiseEmbeddings = await embeddings.generateBatch(filtered.map((promise) => promise.promise_text));

      for (let i = 0; i < filtered.length; i++) {
        const promise = filtered[i];
        const promiseResult = await upsertCanonicalUnit(supabase, {
          userId: scout.user_id,
          scoutId,
          executionId: executionId!,
          statement: promise.promise_text,
          unitType: 'promise',
          entities: [],
          sourceUrl: promise.source_url,
          sourceDomain: promise.source_url ? firecrawl.getDomain(promise.source_url) : 'manual',
          sourceTitle: promise.source_title,
          location: scout.location,
          topic: scout.topic,
          embedding: promiseEmbeddings[i],
          eventDate: promise.due_date || promise.source_date || null,
          publicationDate: promise.source_date || null,
          reviewRequired: false,
          qualityScore: null,
          sourceType: 'scout',
          contentSha256: contentHash,
          contextExcerpt: promise.context,
        });

        if (promiseResult.createdNew) {
          totalUnitsExtracted++;
        } else if (promiseResult.mergedExisting && promiseResult.attachedOccurrence) {
          mergedExistingCount++;
        }

        const { error: promiseInsertError } = await supabase.from('promises').insert({
          scout_id: scoutId,
          user_id: scout.user_id,
          unit_id: promiseResult.unitId,
          promise_text: promise.promise_text,
          context: promise.context,
          source_url: promise.source_url,
          source_title: promise.source_title,
          meeting_date: promise.source_date || null,
          due_date: promise.due_date,
          date_confidence: promise.date_confidence,
          status: 'new',
        });

        if (promiseInsertError && promiseInsertError.code !== '23505') {
          throw promiseInsertError;
        }
      }
      console.log(`[${executionId}] Stored ${filtered.length} promise(s)`);
    }

    // =========================================================================
    // STEP 8: UPDATE SCOUT (hash + processed URLs)
    // =========================================================================

    // Append new URLs to processed list, cap at PROCESSED_URLS_CAP
    let updatedProcessed = [...processedUrls, ...successfulUrls];
    if (updatedProcessed.length > PROCESSED_URLS_CAP) {
      updatedProcessed = updatedProcessed.slice(updatedProcessed.length - PROCESSED_URLS_CAP);
    }

    await supabase
      .from('scouts')
      .update({
        last_run_at: new Date().toISOString(),
        consecutive_failures: 0,
        content_hash: contentHash,
        processed_pdf_urls: updatedProcessed,
      })
      .eq('id', scoutId);

    // =========================================================================
    // STEP 9: SEND NOTIFICATION
    // =========================================================================

    let notificationSent = false;

    if (filtered.length > 0 && !skipNotification && ADMIN_EMAILS.length > 0) {
      const promiseLines = filtered.map((p) => {
        let line = `• ${p.promise_text}`;
        if (p.due_date) line += ` (Frist: ${p.due_date})`;
        return line;
      }).join('\n');

      const summary = `${filtered.length} neue(s) Versprechen gefunden in ${successfulUrls.length} Dokument(en):\n\n${promiseLines}`;

      const emailHtml = resend.buildScoutAlertEmail({
        scoutName: scout.name,
        summary,
        keyFindings: filtered.map((p) => p.promise_text),
        sourceUrl: scout.tracked_urls[0],
        locationCity: scout.location?.city,
      });

      const emailResult = await resend.sendEmail({
        to: ADMIN_EMAILS,
        subject: `Gemeinderat-Alarm: ${scout.name}`,
        html: emailHtml,
      });

      notificationSent = emailResult.success;
    }

    // =========================================================================
    // STEP 10: FINALIZE EXECUTION
    // =========================================================================

    const changeStatus = isFirstRun ? 'first_run' : 'changed';
    const summaryText = batch.length > 0
      ? `${filtered.length} Versprechen in ${successfulUrls.length} Dokument(en) gefunden`
      : 'Hash geändert, aber keine neuen Dokumente gefunden';

    await supabase
      .from('scout_executions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        change_status: changeStatus,
        criteria_matched: filtered.length > 0,
        summary_text: summaryText,
        notification_sent: notificationSent,
        units_extracted: totalUnitsExtracted,
        merged_existing_count: mergedExistingCount,
        scrape_duration_ms: scrapeDurationMs,
      })
      .eq('id', executionId);

    const durationMs = Date.now() - startTime;
    console.log(`[${executionId}] Civic execution completed in ${durationMs}ms`);

    return jsonResponse({
      data: {
        execution_id: executionId,
        status: 'completed',
        change_status: changeStatus,
        promises_found: filtered.length,
        new_doc_urls: successfulUrls,
        units_extracted: totalUnitsExtracted,
        notification_sent: notificationSent,
        duration_ms: durationMs,
        summary: summaryText,
      },
    });
  } catch (error) {
    console.error('execute-civic-scout error:', error);
    if (executionId && scout) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await updateExecutionFailed(supabase, executionId, scout, message);
      } catch (finalizeError) {
        console.error(`[${executionId}] Failed to finalize civic execution after top-level error:`, finalizeError);
      }
      return errorResponse(message, 500);
    }
    return errorResponse(error instanceof Error ? error.message : String(error), 500);
  }
});
