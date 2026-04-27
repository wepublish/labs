import type { Scout } from './supabase-client.ts';
import { firecrawl } from './firecrawl.ts';
import {
  PRIMARY_PAGE_SCRAPE_TIMEOUT_MS,
} from './constants.ts';
import {
  classifyMeetingUrls,
  extractLinksFromHtml,
  firecrawlDelay,
} from './civic-utils.ts';
import { PROCESSED_URLS_CAP } from './civic-constants.ts';

export interface ScoutBaselineFields {
  provider?: 'firecrawl' | 'firecrawl_plain' | null;
  content_hash?: string | null;
  processed_pdf_urls?: string[];
}

interface ScoutBaselineDeps {
  firecrawl: Pick<
    typeof firecrawl,
    'scrape' | 'doubleProbe' | 'computeContentHash' | 'scrapeRawHtml'
  >;
  classifyMeetingUrls: typeof classifyMeetingUrls;
  extractLinksFromHtml: typeof extractLinksFromHtml;
  firecrawlDelay: typeof firecrawlDelay;
}

const DEFAULT_DEPS: ScoutBaselineDeps = {
  firecrawl,
  classifyMeetingUrls,
  extractLinksFromHtml,
  firecrawlDelay,
};

export async function initializeScoutBaseline(
  scout: Scout,
  deps: ScoutBaselineDeps = DEFAULT_DEPS,
): Promise<ScoutBaselineFields> {
  if (scout.scout_type === 'civic') {
    return initializeCivicScoutBaseline(scout, deps);
  }

  return initializeWebScoutBaseline(scout, deps);
}

async function initializeWebScoutBaseline(
  scout: Scout,
  deps: ScoutBaselineDeps,
): Promise<ScoutBaselineFields> {
  if (!scout.url) {
    throw new Error('Scout hat keine URL');
  }

  const changeTrackingTag = `scout-${scout.id}`;

  if (scout.provider === 'firecrawl') {
    const scrapeResult = await deps.firecrawl.scrape({
      url: scout.url,
      formats: ['markdown'],
      timeout: PRIMARY_PAGE_SCRAPE_TIMEOUT_MS,
      changeTrackingTag,
    });

    if (!scrapeResult.success) {
      throw new Error(scrapeResult.error || 'Web-Baseline konnte nicht erstellt werden');
    }

    return {
      provider: 'firecrawl',
      content_hash: null,
    };
  }

  if (scout.provider === 'firecrawl_plain') {
    const scrapeResult = await deps.firecrawl.scrape({
      url: scout.url,
      formats: ['markdown'],
      timeout: PRIMARY_PAGE_SCRAPE_TIMEOUT_MS,
    });

    if (!scrapeResult.success) {
      throw new Error(scrapeResult.error || 'Web-Baseline konnte nicht erstellt werden');
    }

    return {
      provider: 'firecrawl_plain',
      content_hash: await deps.firecrawl.computeContentHash(scrapeResult.markdown || ''),
    };
  }

  const { provider, scrapeResult } = await deps.firecrawl.doubleProbe(
    scout.url,
    changeTrackingTag,
    PRIMARY_PAGE_SCRAPE_TIMEOUT_MS,
  );

  if (!scrapeResult.success) {
    throw new Error(scrapeResult.error || 'Web-Baseline konnte nicht erstellt werden');
  }

  return {
    provider,
    content_hash: provider === 'firecrawl_plain'
      ? await deps.firecrawl.computeContentHash(scrapeResult.markdown || '')
      : null,
  };
}

async function initializeCivicScoutBaseline(
  scout: Scout,
  deps: ScoutBaselineDeps,
): Promise<ScoutBaselineFields> {
  if (!scout.tracked_urls || scout.tracked_urls.length === 0) {
    throw new Error('Keine überwachten URLs konfiguriert');
  }

  let allHtml = '';
  let allLinks: [string, string][] = [];

  for (let i = 0; i < scout.tracked_urls.length; i++) {
    if (i > 0) await deps.firecrawlDelay();

    const pageUrl = scout.tracked_urls[i];
    const result = await deps.firecrawl.scrapeRawHtml(pageUrl, PRIMARY_PAGE_SCRAPE_TIMEOUT_MS);

    if (!result.success || !result.html) {
      console.warn(`[baseline] Civic baseline fetch failed for ${pageUrl}: ${result.error}`);
      continue;
    }

    allHtml += result.html;
    allLinks = allLinks.concat(deps.extractLinksFromHtml(result.html, pageUrl));
  }

  if (allHtml.length === 0) {
    throw new Error('Alle überwachten URLs konnten nicht abgerufen werden');
  }

  const contentHash = await deps.firecrawl.computeContentHash(allHtml);
  const meetingUrls = await deps.classifyMeetingUrls(allLinks);
  const processedPdfUrls = [...new Set(meetingUrls)].slice(-PROCESSED_URLS_CAP);

  return {
    content_hash: contentHash,
    processed_pdf_urls: processedPdfUrls,
  };
}
