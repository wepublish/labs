/**
 * Benchmark and regression test for web scout URL behaviors.
 *
 * Tests three distinct URL behaviors that the double-probe provider detection handles:
 * 1. Blocked URL (justice.gov) — scrape fails
 * 2. Baseline-dropping URL (neunkirch.ch) — firecrawl_plain (changeTracking
 *    baselines silently dropped; double-probe detects this)
 * 3. Normal URL (politico.com) — full changeTracking works (firecrawl)
 *
 * Long-running test (30-120s per case). Manual execution only:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
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

interface TestCase {
  name: string;
  url: string;
  expectSuccess: boolean;
  expectProvider: string | null;
}

const TEST_CASES: TestCase[] = [
  {
    name: 'Blocked URL (justice.gov)',
    url: 'https://www.justice.gov/pardon/clemency-grants-president-donald-j-trump-2025-present',
    expectSuccess: false,
    expectProvider: null,
  },
  {
    name: 'Baseline-dropping URL (neunkirch.ch)',
    url: 'https://www.neunkirch.ch/freizeit/veranstaltungen.html/23',
    expectSuccess: true,
    expectProvider: 'firecrawl_plain',
  },
  {
    name: 'Normal URL (politico.com)',
    url: 'https://www.politico.com',
    expectSuccess: true,
    expectProvider: 'firecrawl',
  },
];

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

for (const tc of TEST_CASES) {
  Deno.test({
    name: `[benchmark] ${tc.name}`,
    // Long timeout: double-probe makes 2 sequential Firecrawl calls
    sanitizeOps: false,
    sanitizeResources: false,
    fn: async () => {
      const scoutId = await createDraftScout(tc.url);

      try {
        const result = await testScout(scoutId);
        const scrapeResult = result.scrape_result as Record<string, unknown>;

        assertEquals(
          scrapeResult.success,
          tc.expectSuccess,
          `Expected scrape success=${tc.expectSuccess} for ${tc.name}`
        );

        if (tc.expectSuccess) {
          assertEquals(
            result.provider,
            tc.expectProvider,
            `Expected provider=${tc.expectProvider} for ${tc.name}, got ${result.provider}`
          );

          // content_hash should be a 64-char hex string
          assertExists(result.content_hash);
          const hash = result.content_hash as string;
          assertEquals(hash.length, 64, 'content_hash should be 64-char hex');
          assertEquals(/^[0-9a-f]{64}$/.test(hash), true, 'content_hash should be hex');
        } else {
          assertEquals(result.provider, null, 'Failed scrape should have null provider');
          assertEquals(result.content_hash, null, 'Failed scrape should have null content_hash');
        }
      } finally {
        await deleteScout(scoutId);
      }
    },
  });
}

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
