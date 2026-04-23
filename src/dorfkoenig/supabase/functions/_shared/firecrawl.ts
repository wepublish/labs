// Firecrawl API client for web scraping

import { DOUBLE_PROBE_TIMEOUT_MS } from './constants.ts';

const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY')!;
const FIRECRAWL_BASE_URL = 'https://api.firecrawl.dev/v2';

interface ScrapeOptions {
  url: string;
  formats?: ('markdown' | 'html' | 'rawHtml' | 'screenshot')[];
  timeout?: number;
  waitFor?: number;
  changeTrackingTag?: string;
  /** Fire-PDF parsing mode. `auto` = text-first with OCR fallback (default, ~400ms/page),
   *  `fast` = text-only (milliseconds/page, skips scanned pages),
   *  `ocr` = force vision model on every page. */
  pdfMode?: 'auto' | 'fast' | 'ocr';
}

interface ScrapeResponse {
  success: boolean;
  data?: {
    markdown?: string;
    html?: string;
    rawHtml?: string;
    metadata?: {
      title?: string;
      description?: string;
      language?: string;
      sourceURL?: string;
      statusCode?: number;
    };
    changeTracking?: {
      changeStatus?: string;
      previousScrapeAt?: string | null;
    };
  };
  error?: string;
}

/**
 * Scrape a URL and return markdown content
 */
export async function scrape(options: ScrapeOptions): Promise<{
  success: boolean;
  markdown: string | null;
  rawHtml: string | null;
  title: string | null;
  changeStatus: string | null;
  previousScrapeAt: string | null;
  error: string | null;
}> {
  const {
    url,
    formats = ['markdown'],
    timeout = 60000,
    changeTrackingTag,
    pdfMode,
  } = options;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Build formats array: include changeTracking object if tag provided
    const resolvedFormats: (string | { type: string; tag: string })[] = [...formats];
    if (changeTrackingTag) {
      resolvedFormats.push({ type: 'changeTracking', tag: changeTrackingTag });
    }

    const body: {
      url: string;
      formats: (string | { type: string; tag: string })[];
      parsers?: { type: 'pdf'; mode: string }[];
    } = {
      url,
      formats: resolvedFormats,
    };

    // Fire-PDF explicit mode. Firecrawl only applies `parsers` when the content is a PDF,
    // so this is safe to send for non-PDF URLs too (ignored).
    if (pdfMode) {
      body.parsers = [{ type: 'pdf', mode: pdfMode }];
    }

    const response = await fetch(`${FIRECRAWL_BASE_URL}/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        markdown: null,
        rawHtml: null,
        title: null,
        changeStatus: null,
        previousScrapeAt: null,
        error: `Firecrawl API error: ${response.status} - ${error}`,
      };
    }

    const data: ScrapeResponse = await response.json();

    if (!data.success || !data.data) {
      return {
        success: false,
        markdown: null,
        rawHtml: null,
        title: null,
        changeStatus: null,
        previousScrapeAt: null,
        error: data.error || 'Unknown scraping error',
      };
    }

    return {
      success: true,
      markdown: data.data.markdown || null,
      rawHtml: data.data.rawHtml || null,
      title: data.data.metadata?.title || null,
      changeStatus: data.data.changeTracking?.changeStatus || null,
      previousScrapeAt: data.data.changeTracking?.previousScrapeAt || null,
      error: null,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    if (err.name === 'AbortError') {
      return {
        success: false,
        markdown: null,
        rawHtml: null,
        title: null,
        changeStatus: null,
        previousScrapeAt: null,
        error: 'Scraping timed out',
      };
    }
    return {
      success: false,
      markdown: null,
      rawHtml: null,
      title: null,
      changeStatus: null,
      previousScrapeAt: null,
      error: err.message,
    };
  }
}

/**
 * Get domain from URL
 */
export function getDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Compute SHA-256 hash of content with whitespace normalization.
 * Normalizes runs of whitespace to single space and trims, preventing
 * false "changed" detections from Firecrawl's non-deterministic trailing whitespace.
 */
export async function computeContentHash(content: string): Promise<string> {
  const normalized = content.replace(/\s+/g, ' ').trim();
  const encoded = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Double-probe to detect whether Firecrawl persists usable baselines for a URL.
 *
 * Two sequential changeTracking calls with the same tag:
 *   Call 1 — establishes the baseline (also serves as the preview scrape).
 *   Call 2 — verifies the baseline was stored AND has real content.
 *
 * Verification on call 2 checks TWO conditions:
 *   1. `previousScrapeAt` has a timestamp → Firecrawl stored something.
 *   2. `changeStatus` is 'same' or 'changed' → Firecrawl actually compared
 *      against stored content (not just a timestamp with empty data).
 *
 * If `previousScrapeAt` is set but `changeStatus` is 'new' or null, the
 * baseline is empty — changeTracking won't work. Falls back to firecrawl_plain.
 */
export async function doubleProbe(
  url: string,
  tag: string,
  timeout = DOUBLE_PROBE_TIMEOUT_MS
): Promise<{
  provider: 'firecrawl' | 'firecrawl_plain';
  scrapeResult: Awaited<ReturnType<typeof scrape>>;
}> {
  // Call 1: establish baseline (also serves as the preview scrape)
  const call1 = await scrape({
    url,
    formats: ['markdown'],
    timeout,
    changeTrackingTag: tag,
  });

  if (!call1.success) {
    console.log(`[doubleProbe] Call 1 failed for ${url}: ${call1.error}`);
    return { provider: 'firecrawl_plain', scrapeResult: call1 };
  }

  // Safety delay for Firecrawl persistence
  await new Promise(resolve => setTimeout(resolve, 500));

  // Call 2: verify baseline persisted with real content
  const call2 = await scrape({
    url,
    formats: ['markdown'],
    timeout,
    changeTrackingTag: tag,
  });

  if (!call2.success) {
    console.log(`[doubleProbe] Call 2 failed for ${url}: ${call2.error}`);
    return { provider: 'firecrawl_plain', scrapeResult: call1 };
  }

  const baselineHasContent = call2.changeStatus === 'same' || call2.changeStatus === 'changed';

  if (call2.previousScrapeAt && baselineHasContent) {
    console.log(`[doubleProbe] Baseline verified for ${url} (previousScrapeAt: ${call2.previousScrapeAt}, changeStatus: ${call2.changeStatus})`);
    return { provider: 'firecrawl', scrapeResult: call1 };
  }

  if (call2.previousScrapeAt && !baselineHasContent) {
    console.log(`[doubleProbe] Baseline exists but is EMPTY for ${url} (previousScrapeAt: ${call2.previousScrapeAt}, changeStatus: ${call2.changeStatus}) — falling back to hash`);
    return { provider: 'firecrawl_plain', scrapeResult: call1 };
  }

  console.log(`[doubleProbe] Baseline dropped for ${url} (previousScrapeAt: null)`);
  return { provider: 'firecrawl_plain', scrapeResult: call1 };
}

/**
 * Discover all URLs on a site using Firecrawl Map API (v1).
 * Fast URL discovery without scraping page content.
 */
export async function mapSite(url: string, limit = 200): Promise<string[]> {
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/map', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({ url, limit, includeSubdomains: true }),
    });

    if (!response.ok) {
      console.error(`mapSite: Map API failed for ${url}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.links || [];
  } catch (error) {
    console.error(`mapSite: failed for ${url}:`, error);
    return [];
  }
}

/**
 * Scrape a URL and return raw HTML (for link extraction).
 * Uses Firecrawl v2/scrape with formats: ['rawHtml'].
 */
export async function scrapeRawHtml(
  url: string,
  timeout = 60000,
): Promise<{ success: boolean; html: string | null; error: string | null }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(`${FIRECRAWL_BASE_URL}/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({ url, formats: ['rawHtml'] }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      return { success: false, html: null, error: `Firecrawl API error: ${response.status} - ${error}` };
    }

    const data: ScrapeResponse = await response.json();
    if (!data.success || !data.data) {
      return { success: false, html: null, error: data.error || 'Unknown scraping error' };
    }

    return {
      success: true,
      html: data.data.rawHtml || null,
      error: null,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return { success: false, html: null, error: err.message };
  }
}

// Export as module
export const firecrawl = {
  scrape,
  getDomain,
  computeContentHash,
  doubleProbe,
  mapSite,
  scrapeRawHtml,
};
