// Firecrawl API client for web scraping with change tracking

const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY')!;
const FIRECRAWL_BASE_URL = 'https://api.firecrawl.dev/v2';

interface ScrapeOptions {
  url: string;
  formats?: ('markdown' | 'html' | 'rawHtml' | 'screenshot')[];
  changeTracking?: {
    mode: 'git-diff';
    tag: string;
  };
  timeout?: number;
  waitFor?: number;
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
      isFirstScrape: boolean;
      hasChanged: boolean;
      changePercentage?: number;
      previousContent?: string;
      diff?: string;
    };
  };
  error?: string;
}

/**
 * Scrape a URL with optional change tracking
 */
export async function scrape(options: ScrapeOptions): Promise<{
  success: boolean;
  markdown: string | null;
  title: string | null;
  changeTracking: {
    isFirstScrape: boolean;
    hasChanged: boolean;
  } | null;
  error: string | null;
}> {
  const {
    url,
    formats = ['markdown'],
    changeTracking,
    timeout = 30000,
  } = options;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const body: Record<string, unknown> = {
      url,
      formats,
    };

    if (changeTracking) {
      body.changeTracking = changeTracking;
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
        title: null,
        changeTracking: null,
        error: `Firecrawl API error: ${response.status} - ${error}`,
      };
    }

    const data: ScrapeResponse = await response.json();

    if (!data.success || !data.data) {
      return {
        success: false,
        markdown: null,
        title: null,
        changeTracking: null,
        error: data.error || 'Unknown scraping error',
      };
    }

    return {
      success: true,
      markdown: data.data.markdown || null,
      title: data.data.metadata?.title || null,
      changeTracking: data.data.changeTracking
        ? {
            isFirstScrape: data.data.changeTracking.isFirstScrape,
            hasChanged: data.data.changeTracking.hasChanged,
          }
        : null,
      error: null,
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      return {
        success: false,
        markdown: null,
        title: null,
        changeTracking: null,
        error: 'Scraping timed out',
      };
    }
    return {
      success: false,
      markdown: null,
      title: null,
      changeTracking: null,
      error: error.message,
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

// Export as module
export const firecrawl = {
  scrape,
  getDomain,
};
