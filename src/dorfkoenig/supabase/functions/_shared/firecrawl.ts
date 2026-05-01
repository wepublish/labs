// Firecrawl API client for web scraping

import { DOUBLE_PROBE_TIMEOUT_MS } from './constants.ts';

const FIRECRAWL_BASE_URL = 'https://api.firecrawl.dev/v2';

function getFirecrawlApiKey(): string {
  const key = Deno.env.get('FIRECRAWL_API_KEY');
  if (!key) throw new Error('FIRECRAWL_API_KEY not configured');
  return key;
}

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

export type FirecrawlScrapeResult = {
  success: boolean;
  markdown: string | null;
  rawHtml: string | null;
  title: string | null;
  changeStatus: string | null;
  previousScrapeAt: string | null;
  error: string | null;
};

type ScrapeFn = (options: ScrapeOptions) => Promise<FirecrawlScrapeResult>;

export type PrimaryScrapeStrategy =
  | 'combined'
  | 'combined_retry'
  | 'split'
  | 'markdown_only_fallback';

export type PrimaryScrapeResult = FirecrawlScrapeResult & {
  strategy: PrimaryScrapeStrategy | null;
  attempts: number;
  warning: string | null;
};

/**
 * Scrape a URL and return markdown content
 */
export async function scrape(options: ScrapeOptions): Promise<FirecrawlScrapeResult> {
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
        'Authorization': `Bearer ${getFirecrawlApiKey()}`,
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

function isRetryableScrapeError(error: string | null): boolean {
  if (!error) return false;
  const normalized = error.toLowerCase();
  return (
    normalized.includes('timed out') ||
    normalized.includes('abort') ||
    normalized.includes('network') ||
    normalized.includes('firecrawl api error: 429') ||
    /firecrawl api error:\s*5\d\d/.test(normalized)
  );
}

function appendWarning(current: string | null, next: string): string {
  if (!current) return next;
  if (current.split(',').includes(next)) return current;
  return `${current},${next}`;
}

function toSuccessfulPrimary(
  result: FirecrawlScrapeResult,
  strategy: PrimaryScrapeStrategy,
  attempts: number,
  warning: string | null,
): PrimaryScrapeResult {
  return {
    ...result,
    success: true,
    strategy,
    attempts,
    warning,
  };
}

function toFailedPrimary(
  result: FirecrawlScrapeResult,
  attempts: number,
  warning: string | null,
): PrimaryScrapeResult {
  return {
    ...result,
    success: false,
    strategy: null,
    attempts,
    warning,
  };
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Primary page scrape with fallback for intermittent combined-format Firecrawl
 * stalls. The scout needs markdown to proceed; rawHtml is best-effort and only
 * required for listing subpage follow-up.
 */
export async function scrapePrimaryPageResilient(options: {
  url: string;
  timeout: number;
  changeTrackingTag?: string;
  retryBackoffMs?: number;
  scrapeFn?: ScrapeFn;
}): Promise<PrimaryScrapeResult> {
  const {
    url,
    timeout,
    changeTrackingTag,
    retryBackoffMs = 2_000 + Math.floor(Math.random() * 3_000),
    scrapeFn = scrape,
  } = options;

  let attempts = 0;
  let warning: string | null = null;

  const combinedOptions: ScrapeOptions = {
    url,
    formats: ['markdown', 'rawHtml'],
    timeout,
    changeTrackingTag,
  };

  attempts++;
  const combined = await scrapeFn(combinedOptions);
  if (combined.success && combined.markdown && combined.rawHtml) {
    return toSuccessfulPrimary(combined, 'combined', attempts, warning);
  }
  if (combined.success && combined.markdown && !combined.rawHtml) {
    warning = appendWarning(warning, 'raw_html_missing_combined');
  } else if (!combined.success) {
    warning = appendWarning(warning, isRetryableScrapeError(combined.error) ? 'combined_timeout' : 'combined_failed');
  }

  if (!combined.success && isRetryableScrapeError(combined.error)) {
    await sleep(retryBackoffMs);
    attempts++;
    const retry = await scrapeFn(combinedOptions);
    if (retry.success && retry.markdown && retry.rawHtml) {
      return toSuccessfulPrimary(retry, 'combined_retry', attempts, warning);
    }
    if (retry.success && retry.markdown && !retry.rawHtml) {
      warning = appendWarning(warning, 'raw_html_missing_combined_retry');
    } else if (!retry.success) {
      warning = appendWarning(warning, isRetryableScrapeError(retry.error) ? 'combined_retry_timeout' : 'combined_retry_failed');
    }
  }

  const markdown = combined.success && combined.markdown
    ? combined
    : await (async () => {
      attempts++;
      return scrapeFn({
      url,
      formats: ['markdown'],
      timeout,
      changeTrackingTag,
      });
    })();

  if (!markdown.success || !markdown.markdown) {
    const failed = markdown.success
      ? { ...markdown, success: false, error: markdown.error || 'Scrape returned no markdown content' }
      : markdown;
    return toFailedPrimary(failed, attempts, warning);
  }

  attempts++;
  const rawHtml = await scrapeFn({
    url,
    formats: ['rawHtml'],
    timeout,
  });

  if (rawHtml.success && rawHtml.rawHtml) {
    return toSuccessfulPrimary({
      ...markdown,
      rawHtml: rawHtml.rawHtml,
      title: markdown.title || rawHtml.title,
    }, 'split', attempts, warning);
  }

  warning = appendWarning(
    warning,
    isRetryableScrapeError(rawHtml.error) ? 'raw_html_timeout' : 'raw_html_failed',
  );

  return toSuccessfulPrimary({
    ...markdown,
    rawHtml: null,
  }, 'markdown_only_fallback', attempts, warning);
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
        'Authorization': `Bearer ${getFirecrawlApiKey()}`,
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
        'Authorization': `Bearer ${getFirecrawlApiKey()}`,
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
  scrapePrimaryPageResilient,
  getDomain,
  computeContentHash,
  doubleProbe,
  mapSite,
  scrapeRawHtml,
};
