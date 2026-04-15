/**
 * @module execute-scout
 * 9-step execution pipeline: scrape -> change detection -> criteria analysis ->
 * dedup -> store -> extract units -> notify -> update scout -> finalize.
 * POST: triggered by pg_cron dispatch or manual run. Auth: service role or x-user-id.
 */

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase-client.ts';
import { firecrawl } from '../_shared/firecrawl.ts';
import { embeddings } from '../_shared/embeddings.ts';
import { resend } from '../_shared/resend.ts';
import { DEDUP_THRESHOLD, DEDUP_LOOKBACK_DAYS } from '../_shared/constants.ts';
import { extractInformationUnits } from '../_shared/unit-extraction.ts';
import { updateExecutionFailed } from '../_shared/execution-helpers.ts';
import { analyzeCriteria, summarizeContent } from '../_shared/criteria-analysis.ts';

interface ExecuteRequest {
  scoutId: string;
  executionId?: string;
  skipNotification?: boolean;
  extractUnits?: boolean;
}

Deno.serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();
  const supabase = createServiceClient();

  try {
    const body: ExecuteRequest = await req.json();
    const { scoutId, skipNotification = false, extractUnits = true } = body;
    let { executionId } = body;

    if (!scoutId) {
      return errorResponse('Scout ID erforderlich', 400);
    }

    // Fetch scout
    const { data: scout, error: scoutError } = await supabase
      .from('scouts')
      .select('*')
      .eq('id', scoutId)
      .single();

    if (scoutError || !scout) {
      return errorResponse('Scout nicht gefunden', 404);
    }

    // Only web scouts use this pipeline; civic scouts use execute-civic-scout
    if (!scout.url) {
      return errorResponse('Scout hat keine URL (falscher Scout-Typ?)', 400);
    }

    // Create execution record if not provided
    if (!executionId) {
      // Check for existing running execution
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

    console.log(`[${executionId}] Starting execution for scout: ${scout.name} (provider: ${scout.provider || 'default'})`);

    // =========================================================================
    // STEP 1: SCRAPE (provider-aware)
    // =========================================================================

    // firecrawl_plain: scrape without changeTracking, use hash comparison
    // firecrawl or null (legacy): scrape with changeTracking
    const useChangeTracking = scout.provider !== 'firecrawl_plain';

    const scrapeResult = await firecrawl.scrape({
      url: scout.url,
      formats: ['markdown'],
      timeout: 60000,
      changeTrackingTag: useChangeTracking ? `scout-${scoutId}` : undefined,
    });

    const scrapeDurationMs = Date.now() - startTime;

    if (!scrapeResult.success) {
      console.error(`[${executionId}] Scrape failed:`, scrapeResult.error);
      await updateExecutionFailed(supabase, executionId, scout, scrapeResult.error!);
      return jsonResponse({
        data: {
          execution_id: executionId,
          status: 'failed',
          error: scrapeResult.error,
        },
      });
    }

    // =========================================================================
    // STEP 2: CHECK CHANGES (provider-aware)
    // =========================================================================
    let changeStatus: string;
    let newHash: string | null = null;

    if (scout.provider === 'firecrawl_plain') {
      // Hash-based change detection
      newHash = await firecrawl.computeContentHash(scrapeResult.markdown || '');
      if (!scout.content_hash) {
        // First run for firecrawl_plain — store hash and exit
        changeStatus = 'first_run';

        await supabase
          .from('scout_executions')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            change_status: 'first_run',
            summary_text: 'Baseline gespeichert',
            scrape_duration_ms: scrapeDurationMs,
          })
          .eq('id', executionId);

        await supabase
          .from('scouts')
          .update({
            last_run_at: new Date().toISOString(),
            consecutive_failures: 0,
            content_hash: newHash,
          })
          .eq('id', scoutId);

        const durationMs = Date.now() - startTime;
        return jsonResponse({
          data: {
            execution_id: executionId,
            status: 'completed',
            change_status: 'first_run',
            criteria_matched: false,
            is_duplicate: false,
            notification_sent: false,
            units_extracted: 0,
            duration_ms: durationMs,
            summary: 'Baseline gespeichert',
          },
        });
      } else if (newHash === scout.content_hash) {
        changeStatus = 'same';
      } else {
        changeStatus = 'changed';
      }
    } else {
      // Firecrawl changeTracking-based detection (default/legacy)
      if (scrapeResult.changeStatus === 'new') {
        changeStatus = 'first_run';
      } else if (scrapeResult.changeStatus === 'same') {
        changeStatus = 'same';
      } else {
        // 'changed', 'removed', or null (API didn't return it) → treat as changed
        changeStatus = 'changed';
      }
    }

    // Early exit if content hasn't changed
    if (changeStatus === 'same') {
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
        .update({
          last_run_at: new Date().toISOString(),
          consecutive_failures: 0,
        })
        .eq('id', scoutId);

      const durationMs = Date.now() - startTime;
      return jsonResponse({
        data: {
          execution_id: executionId,
          status: 'completed',
          change_status: 'same',
          criteria_matched: false,
          is_duplicate: false,
          notification_sent: false,
          units_extracted: 0,
          duration_ms: durationMs,
          summary: 'Keine Änderungen erkannt',
        },
      });
    }

    // =========================================================================
    // STEP 3: ANALYZE CRITERIA (or summarize if "Jede Änderung" mode)
    // =========================================================================

    // Fetch recent findings for context
    const { data: recentExecutions } = await supabase
      .from('scout_executions')
      .select('summary_text')
      .eq('scout_id', scoutId)
      .eq('status', 'completed')
      .not('summary_text', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5);

    const recentFindings = recentExecutions?.map((e) => e.summary_text).filter(Boolean) || [];

    const hasCriteria = !!scout.criteria?.trim();

    const analysis = hasCriteria
      ? await analyzeCriteria(scrapeResult.markdown!, scout.criteria, recentFindings)
      : await summarizeContent(scrapeResult.markdown!, recentFindings);

    // =========================================================================
    // STEP 4: CHECK DUPLICATES
    // =========================================================================

    let isDuplicate = false;
    let duplicateSimilarity: number | null = null;
    let summaryEmbedding: number[] | null = null;

    if (analysis.matches && analysis.summary) {
      summaryEmbedding = await embeddings.generate(analysis.summary);

      const { data: dedupResult } = await supabase.rpc('check_duplicate_execution', {
        p_scout_id: scoutId,
        p_embedding: summaryEmbedding,
        p_threshold: DEDUP_THRESHOLD,
        p_lookback_days: DEDUP_LOOKBACK_DAYS,
      });

      if (dedupResult && dedupResult.length > 0) {
        isDuplicate = dedupResult[0].is_duplicate;
        duplicateSimilarity = dedupResult[0].max_similarity;
      }

    }

    // =========================================================================
    // STEP 5: STORE EXECUTION
    // =========================================================================

    await supabase
      .from('scout_executions')
      .update({
        change_status: changeStatus,
        criteria_matched: analysis.matches,
        summary_text: analysis.summary,
        summary_embedding: summaryEmbedding,
        is_duplicate: isDuplicate,
        duplicate_similarity: duplicateSimilarity,
        scrape_duration_ms: scrapeDurationMs,
      })
      .eq('id', executionId);

    // =========================================================================
    // STEP 6: EXTRACT UNITS
    // =========================================================================
    let unitsExtracted = 0;

    const locationMode = (scout.location_mode as 'manual' | 'auto' | null) ?? 'manual';
    // Auto-mode scouts don't need a scout.location — the LLM assigns per unit.
    const hasScope = locationMode === 'auto' || scout.location || scout.topic;

    if (extractUnits && analysis.matches && hasScope) {
      try {
        unitsExtracted = await extractInformationUnits(
          supabase,
          scrapeResult.markdown!,
          {
            scoutId: scout.id,
            userId: scout.user_id,
            executionId: executionId!,
            sourceUrl: scout.url,
            location: scout.location,
            topic: scout.topic,
            locationMode,
            criteria: scout.criteria,
            contentHash: newHash ?? undefined,
          },
        );
      } catch (error) {
        console.error(`[${executionId}] Unit extraction failed:`, error);
        // Continue without units
      }
    }

    // =========================================================================
    // STEP 7: SEND NOTIFICATION
    // =========================================================================
    let notificationSent = false;
    let notificationError: string | null = null;

    if (
      analysis.matches &&
      !isDuplicate &&
      !skipNotification &&
      scout.notification_email
    ) {
      const emailHtml = resend.buildScoutAlertEmail({
        scoutName: scout.name,
        summary: analysis.summary,
        keyFindings: analysis.keyFindings,
        sourceUrl: scout.url,
        locationCity: scout.location?.city,
      });

      const emailResult = await resend.sendEmail({
        to: scout.notification_email,
        subject: `Scout-Alarm: ${scout.name}${scout.location?.city ? ` (${scout.location.city})` : ''}`,
        html: emailHtml,
      });

      notificationSent = emailResult.success;
      notificationError = emailResult.error || null;

    }

    // =========================================================================
    // STEP 8: UPDATE SCOUT
    // =========================================================================

    const scoutUpdate: {
      last_run_at: string;
      consecutive_failures: number;
      content_hash?: string;
    } = {
      last_run_at: new Date().toISOString(),
      consecutive_failures: 0,
    };

    // Deferred hash update: only write new hash after pipeline succeeds
    if (newHash) {
      scoutUpdate.content_hash = newHash;
    }

    await supabase
      .from('scouts')
      .update(scoutUpdate)
      .eq('id', scoutId);

    // =========================================================================
    // STEP 9: FINALIZE AND RETURN
    // =========================================================================

    await supabase
      .from('scout_executions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        notification_sent: notificationSent,
        notification_error: notificationError,
        units_extracted: unitsExtracted,
      })
      .eq('id', executionId);

    const durationMs = Date.now() - startTime;
    console.log(`[${executionId}] Execution completed in ${durationMs}ms`);

    return jsonResponse({
      data: {
        execution_id: executionId,
        status: 'completed',
        change_status: changeStatus,
        criteria_matched: analysis.matches,
        is_duplicate: isDuplicate,
        notification_sent: notificationSent,
        units_extracted: unitsExtracted,
        duration_ms: durationMs,
        summary: analysis.summary,
      },
    });
  } catch (error) {
    console.error('Execute scout error:', error);
    return errorResponse(error.message, 500);
  }
});


