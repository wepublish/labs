import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';
import { initializeScoutBaseline } from '../../_shared/scout-baseline.ts';
import type { Scout } from '../../_shared/supabase-client.ts';

function makeScout(overrides: Partial<Scout> = {}): Scout {
  return {
    id: 'scout-1',
    user_id: 'user-1',
    name: 'Test Scout',
    url: 'https://example.ch/news',
    criteria: '',
    location: { city: 'aesch', country: 'Schweiz' },
    frequency: 'daily',
    is_active: false,
    last_run_at: null,
    consecutive_failures: 0,
    topic: null,
    provider: null,
    content_hash: null,
    scout_type: 'web',
    root_domain: null,
    tracked_urls: null,
    processed_pdf_urls: null,
    location_mode: 'manual',
    created_at: '2026-04-27T00:00:00Z',
    updated_at: '2026-04-27T00:00:00Z',
    ...overrides,
  };
}

function makeDeps(overrides: Partial<Parameters<typeof initializeScoutBaseline>[1]> = {}) {
  return {
    firecrawl: {
      scrape: () => Promise.resolve({
        success: true,
        markdown: 'Baseline content',
        rawHtml: null,
        title: 'Title',
        changeStatus: 'new',
        previousScrapeAt: null,
        error: null,
      }),
      doubleProbe: () => Promise.resolve({
        provider: 'firecrawl' as const,
        scrapeResult: {
          success: true,
          markdown: 'Baseline content',
          rawHtml: null,
          title: 'Title',
          changeStatus: 'new',
          previousScrapeAt: null,
          error: null,
        },
      }),
      computeContentHash: (content: string) => Promise.resolve(`hash:${content}`),
      scrapeRawHtml: () => Promise.resolve({
        success: true,
        html: '<a href="/minutes.pdf">Minutes</a>',
        error: null,
      }),
    },
    classifyMeetingUrls: () => Promise.resolve(['https://example.ch/minutes.pdf']),
    extractLinksFromHtml: () => [['https://example.ch/minutes.pdf', 'Minutes']] as [string, string][],
    firecrawlDelay: () => Promise.resolve(),
    ...overrides,
  };
}

Deno.test('initializeScoutBaseline returns firecrawl provider with no hash when change tracking verifies', async () => {
  const result = await initializeScoutBaseline(makeScout(), makeDeps({
    firecrawl: {
      ...makeDeps().firecrawl,
      doubleProbe: () => Promise.resolve({
        provider: 'firecrawl',
        scrapeResult: {
          success: true,
          markdown: 'Tracked baseline',
          rawHtml: null,
          title: 'Tracked',
          changeStatus: 'new',
          previousScrapeAt: null,
          error: null,
        },
      }),
    },
  }));

  assertEquals(result, {
    provider: 'firecrawl',
    content_hash: null,
  });
});

Deno.test('initializeScoutBaseline returns firecrawl_plain with content hash on fallback', async () => {
  const result = await initializeScoutBaseline(makeScout(), makeDeps({
    firecrawl: {
      ...makeDeps().firecrawl,
      doubleProbe: () => Promise.resolve({
        provider: 'firecrawl_plain',
        scrapeResult: {
          success: true,
          markdown: 'Plain baseline',
          rawHtml: null,
          title: 'Plain',
          changeStatus: 'new',
          previousScrapeAt: null,
          error: null,
        },
      }),
    },
  }));

  assertEquals(result, {
    provider: 'firecrawl_plain',
    content_hash: 'hash:Plain baseline',
  });
});

Deno.test('initializeScoutBaseline throws when web baseline scrape fails', async () => {
  await assertRejects(
    () => initializeScoutBaseline(makeScout(), makeDeps({
      firecrawl: {
        ...makeDeps().firecrawl,
        doubleProbe: () => Promise.resolve({
          provider: 'firecrawl_plain',
          scrapeResult: {
            success: false,
            markdown: null,
            rawHtml: null,
            title: null,
            changeStatus: null,
            previousScrapeAt: null,
            error: 'boom',
          },
        }),
      },
    })),
    Error,
    'boom',
  );
});
