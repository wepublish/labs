/**
 * Benchmark and regression test for web scout URL behaviors.
 *
 * Tests three distinct conditions the double-probe system must handle:
 *
 * 1. Blocked URL (nytimes.com) — scrape fails, error surfaces to user
 * 2. Flaky Swiss municipal URL (neunkirch.ch) — non-deterministic behavior:
 *    times out, drops baselines (firecrawl_plain), or sometimes persists them.
 *    Validates that the system handles all outcomes gracefully and that
 *    firecrawl is only returned when baseline content is verified.
 * 3. Normal URL (politico.com) — full changeTracking works, baseline
 *    verified with real content → firecrawl.
 *
 * Long-running test (30-120s per case). Manual execution only:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... \
 *     deno test --allow-net --allow-env benchmark_web_test.ts
 */

import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const TEST_USER_ID = 'benchmark-web-test';
const BASE_URL = `${SUPABASE_URL}/functions/v1/scouts`;

function headers(userId = TEST_USER_ID): HeadersInit {
  return {
    'Authorization': `Bearer ${ANON_KEY}`,
    'Content-Type': 'application/json',
    'x-user-id': userId,
  };
}

// Track IDs created during this test run for cleanup.
const createdScoutIds: string[] = [];

async function createDraftScout(url: string): Promise<string> {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      name: `bench-${Date.now()}`,
      url,
      criteria: '',
      frequency: 'daily',
      location: { city: 'Benchmark', country: 'Test' },
      is_active: false,
    }),
  });
  assertEquals(res.status, 201);
  const body = await res.json();
  const id = body.data.id;
  createdScoutIds.push(id);
  return id;
}

async function testScout(scoutId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}/${scoutId}/test`, {
    method: 'POST',
    headers: headers(),
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  return body.data;
}

async function deleteScout(scoutId: string): Promise<void> {
  await fetch(`${BASE_URL}/${scoutId}`, {
    method: 'DELETE',
    headers: headers(),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test({
  name: '[benchmark] Blocked URL (nytimes.com) — error surfaced to user',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const scoutId = await createDraftScout(
      'https://www.nytimes.com/2024/01/01/us/politics/example.html'
    );

    try {
      const result = await testScout(scoutId);
      const scrape = result.scrape_result as Record<string, unknown>;

      // Must fail — scraper is blocked
      assertEquals(scrape.success, false, 'Blocked URL should fail');
      // Error message must exist for the UI to display
      assertExists(scrape.error, 'Must have error message for UI');
      // No provider or hash when scrape fails
      assertEquals(result.provider, null, 'Failed scrape should have null provider');
      assertEquals(result.content_hash, null, 'Failed scrape should have null content_hash');
    } finally {
      await deleteScout(scoutId);
    }
  },
});

Deno.test({
  name: '[benchmark] Flaky URL (neunkirch.ch) — graceful handling, no false positives',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const scoutId = await createDraftScout(
      'https://www.neunkirch.ch/freizeit/veranstaltungen.html/23'
    );

    try {
      const result = await testScout(scoutId);
      const scrape = result.scrape_result as Record<string, unknown>;

      // This slow Swiss site has non-deterministic behavior at Firecrawl's end.
      // Three valid outcomes — all must be handled gracefully:
      //
      // A) Scrape succeeds, baseline persists with content → firecrawl (verified)
      // B) Scrape succeeds, baseline drops or is empty → firecrawl_plain (hash fallback)
      // C) Scrape times out → error surfaced to user
      //
      // The hardened double-probe guarantees that 'firecrawl' is only returned
      // when call 2 saw changeStatus 'same' or 'changed' — proving the baseline
      // has real content. So any outcome here is correct.

      if (scrape.success) {
        // Outcome A or B: scrape worked
        assertExists(result.provider, 'Successful scrape must have provider');
        assertExists(result.content_hash, 'Successful scrape must have content_hash');
        const hash = result.content_hash as string;
        assertEquals(hash.length, 64, 'content_hash should be 64-char hex');
        assertEquals(/^[0-9a-f]{64}$/.test(hash), true, 'content_hash should be hex');

        // Provider must be one of the two valid values
        const validProviders = ['firecrawl', 'firecrawl_plain'];
        assertEquals(
          validProviders.includes(result.provider as string),
          true,
          `Provider must be firecrawl or firecrawl_plain, got: ${result.provider}`
        );

        console.log(`  [info] neunkirch.ch succeeded — provider: ${result.provider}`);
      } else {
        // Outcome C: timeout — error surfaced gracefully
        assertExists(scrape.error, 'Timeout must have error message for UI');
        assertEquals(result.provider, null);
        assertEquals(result.content_hash, null);
        console.log(`  [info] neunkirch.ch timed out (expected for slow site): ${scrape.error}`);
      }
    } finally {
      await deleteScout(scoutId);
    }
  },
});

Deno.test({
  name: '[benchmark] Normal URL (politico.com) — baseline verified with content',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const scoutId = await createDraftScout('https://www.politico.com');

    try {
      const result = await testScout(scoutId);
      const scrape = result.scrape_result as Record<string, unknown>;

      // Must succeed
      assertEquals(scrape.success, true, 'politico.com should scrape successfully');

      // Must be firecrawl — baseline persists AND has real content
      assertEquals(
        result.provider,
        'firecrawl',
        'politico.com should use firecrawl (baseline verified)'
      );

      // content_hash should be a 64-char hex string
      assertExists(result.content_hash);
      const hash = result.content_hash as string;
      assertEquals(hash.length, 64, 'content_hash should be 64-char hex');
      assertEquals(/^[0-9a-f]{64}$/.test(hash), true, 'content_hash should be hex');
    } finally {
      await deleteScout(scoutId);
    }
  },
});

// Cleanup fallback
Deno.test({
  name: '[benchmark] cleanup',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    for (const id of createdScoutIds) {
      await deleteScout(id).catch(() => {});
    }
  },
});
