/**
 * @module civic-test
 * Test extraction on selected council URLs before scheduling a civic scout.
 * POST: { tracked_urls[], criteria? } → fetch HTML → extract links → classify →
 *   parse docs → extract promises → return preview.
 * No storage, no side effects. Auth: x-user-id header.
 */

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { requireUserId } from '../_shared/supabase-client.ts';
import { firecrawl } from '../_shared/firecrawl.ts';
import { MAX_DOCS_PER_RUN } from '../_shared/civic-constants.ts';
import {
  extractLinksFromHtml,
  classifyMeetingUrls,
  extractPromises,
  filterPromises,
  extractDateFromUrl,
  type ExtractedPromise,
} from '../_shared/civic-utils.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse('Methode nicht erlaubt', 405);
  }

  try {
    requireUserId(req);

    const body = await req.json();
    const trackedUrls: string[] = body.tracked_urls;
    const criteria: string | undefined = body.criteria;

    if (!Array.isArray(trackedUrls) || trackedUrls.length === 0) {
      return errorResponse('Mindestens eine URL ist erforderlich', 400);
    }

    if (trackedUrls.length > 2) {
      return errorResponse('Maximal 2 URLs erlaubt', 400);
    }

    console.log(`[civic-test] Testing ${trackedUrls.length} URL(s)${criteria ? ` with criteria: "${criteria}"` : ''}`);

    // Step 1: Fetch tracked pages via raw HTML and extract links
    let allLinks: [string, string][] = [];

    for (let i = 0; i < trackedUrls.length; i++) {
      const pageUrl = trackedUrls[i];
      console.log(`[civic-test] Fetching: ${pageUrl}`);
      const result = await firecrawl.scrapeRawHtml(pageUrl);

      if (!result.success || !result.html) {
        console.warn(`[civic-test] Failed to fetch ${pageUrl}: ${result.error}`);
        continue;
      }

      const links = extractLinksFromHtml(result.html, pageUrl);
      allLinks = allLinks.concat(links);
    }

    if (allLinks.length === 0) {
      return jsonResponse({
        data: {
          valid: false,
          documents_found: 0,
          sample_promises: [],
          error: 'Keine Links auf den Seiten gefunden',
        },
      });
    }

    // Step 2: Classify links as meeting documents
    const meetingUrls = await classifyMeetingUrls(allLinks);

    if (meetingUrls.length === 0) {
      return jsonResponse({
        data: {
          valid: true,
          documents_found: 0,
          sample_promises: [],
        },
      });
    }

    // Step 3: Cap at MAX_DOCS_PER_RUN and parse
    const batch = meetingUrls.slice(0, MAX_DOCS_PER_RUN);
    const allPromises: ExtractedPromise[] = [];
    let docsProcessed = 0;

    for (let i = 0; i < batch.length; i++) {
      const docUrl = batch[i];

      console.log(`[civic-test] Parsing document: ${docUrl}`);
      const scrapeResult = await firecrawl.scrape({
        url: docUrl,
        formats: ['markdown'],
        timeout: 60000,
      });

      if (!scrapeResult.success || !scrapeResult.markdown) {
        console.warn(`[civic-test] Failed to parse ${docUrl}: ${scrapeResult.error}`);
        continue;
      }

      const sourceDate = extractDateFromUrl(docUrl);
      const promises = await extractPromises(
        scrapeResult.markdown,
        docUrl,
        scrapeResult.title,
        sourceDate,
        criteria,
      );

      allPromises.push(...promises);
      docsProcessed++;
    }

    // Step 4: Filter promises (future dates, criteria match)
    const filtered = filterPromises(allPromises, !!criteria);

    console.log(`[civic-test] Found ${filtered.length} promises in ${docsProcessed} document(s)`);

    return jsonResponse({
      data: {
        valid: true,
        documents_found: docsProcessed,
        sample_promises: filtered,
      },
    });
  } catch (error) {
    console.error('civic-test error:', error);
    if (error.message === 'Authentication required') {
      return errorResponse('Authentifizierung erforderlich', 401, 'UNAUTHORIZED');
    }
    return errorResponse(error.message, 500);
  }
});
