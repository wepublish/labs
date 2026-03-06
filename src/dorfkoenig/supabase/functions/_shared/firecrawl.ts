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
}

interface ScrapeResponse {
  success: boolean;
  data?: {
    markdown?: string;
    html?: string;
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
  } = options;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Build formats array: include changeTracking object if tag provided
    const resolvedFormats: (string | { type: string; tag: string })[] = [...formats];
    if (changeTrackingTag) {
      resolvedFormats.push({ type: 'changeTracking', tag: changeTrackingTag });
    }

    const body: Record<string, unknown> = {
      url,
      formats: resolvedFormats,
    };

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
        title: null,
        changeStatus: null,
        previousScrapeAt: null,
        error: data.error || 'Unknown scraping error',
      };
    }

    return {
      success: true,
      markdown: data.data.markdown || null,
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
        title: null,
        changeStatus: null,
        previousScrapeAt: null,
        error: 'Scraping timed out',
      };
    }
    return {
      success: false,
      markdown: null,
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
 * Double-probe to detect whether Firecrawl persists baselines for a URL.
 *
 * Two sequential changeTracking calls with the same tag. On the second call,
 * `previousScrapeAt` is definitive:
 *   - Has timestamp → baseline stored → 'firecrawl'
 *   - null → baseline dropped → 'firecrawl_plain'
 *
 * Assumption: Firecrawl persists baselines synchronously (confirmed via CLI
 * testing 2026-03-04, but no documented API guarantee).
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

  // Call 2: check if baseline persisted
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

  if (call2.previousScrapeAt) {
    console.log(`[doubleProbe] Baseline persisted for ${url} (previousScrapeAt: ${call2.previousScrapeAt})`);
    return { provider: 'firecrawl', scrapeResult: call1 };
  }

  console.log(`[doubleProbe] Baseline dropped for ${url} (previousScrapeAt: null)`);
  return { provider: 'firecrawl_plain', scrapeResult: call1 };
}

// Export as module
export const firecrawl = {
  scrape,
  getDomain,
  computeContentHash,
  doubleProbe,
};
