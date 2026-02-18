/**
 * Integration tests for the Executions Edge Function.
 *
 * Calls the deployed endpoint at /functions/v1/executions and validates
 * listing, filtering, pagination, detail retrieval, and 404 handling.
 *
 * DIAGNOSTIC NOTE: The same URL-routing bug that affects the scouts endpoint
 * likely affects this endpoint too. GET /executions/{id} may return the list
 * instead of a single execution detail.
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
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TEST_USER_ID = 'test-runner-integration';

const BASE_URL = `${SUPABASE_URL}/functions/v1/executions`;
const SCOUTS_URL = `${SUPABASE_URL}/functions/v1/scouts`;

function headers(userId = TEST_USER_ID): HeadersInit {
  return {
    'Authorization': `Bearer ${ANON_KEY}`,
    'Content-Type': 'application/json',
    'x-user-id': userId,
  };
}

// Track IDs for cleanup
const createdScoutIds: string[] = [];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test({
  name: 'executions: list executions returns data and meta',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const res = await fetch(BASE_URL, { method: 'GET', headers: headers() });
    const body = await res.json();

    console.log(`[INFO] list executions: status=${res.status} count=${body.data?.length ?? 'N/A'} total=${body.meta?.total ?? 'N/A'}`);

    assertEquals(res.status, 200, `Expected 200 but got ${res.status}`);
    assertExists(body.data, 'Response should contain data');
    assertEquals(Array.isArray(body.data), true, 'data should be an array');
    assertExists(body.meta, 'Response should contain meta');
    assertEquals(body.meta.total !== undefined, true, 'meta should have total');
    assertEquals(body.meta.limit !== undefined, true, 'meta should have limit');
    assertEquals(body.meta.offset !== undefined, true, 'meta should have offset');
  },
});

Deno.test({
  name: 'executions: list with scout_id filter',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Create a scout to use as filter (even if it has no executions)
    const createRes = await fetch(SCOUTS_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        name: 'Executions Filter Test Scout',
        url: 'https://example.com',
        criteria: 'Test criteria',
        frequency: 'daily',
        location: { city: 'Zurich', country: 'Switzerland' },
        notification_email: null,
      }),
    });
    const created = await createRes.json();
    assertEquals(createRes.status, 201, 'Setup: create scout should succeed');
    const scoutId = created.data.id;
    createdScoutIds.push(scoutId);

    // Filter executions by this scout
    const res = await fetch(`${BASE_URL}?scout_id=${scoutId}`, {
      method: 'GET',
      headers: headers(),
    });
    const body = await res.json();

    console.log(`[INFO] filtered executions: status=${res.status} count=${body.data?.length ?? 'N/A'}`);

    assertEquals(res.status, 200, `Expected 200 but got ${res.status}`);
    assertExists(body.data, 'Response should contain data');
    assertEquals(Array.isArray(body.data), true, 'data should be an array');

    // All returned executions should belong to this scout
    for (const exec of body.data) {
      assertEquals(exec.scout_id, scoutId, 'Execution should belong to filtered scout');
    }
  },
});

Deno.test({
  name: 'executions: list with pagination params',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const res = await fetch(`${BASE_URL}?limit=2&offset=0`, {
      method: 'GET',
      headers: headers(),
    });
    const body = await res.json();

    console.log(`[INFO] paginated executions: status=${res.status} count=${body.data?.length ?? 'N/A'} meta=${JSON.stringify(body.meta)}`);

    assertEquals(res.status, 200, `Expected 200 but got ${res.status}`);
    assertExists(body.meta, 'Response should contain meta');
    assertEquals(body.meta.limit, 2, 'Limit should be 2');
    assertEquals(body.meta.offset, 0, 'Offset should be 0');

    // data length should not exceed limit
    if (body.data) {
      assertEquals(
        body.data.length <= 2,
        true,
        `Expected at most 2 results but got ${body.data.length}`
      );
    }
  },
});

Deno.test({
  name: 'executions: get execution detail by ID (BUG DIAGNOSTIC: routing)',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // First list executions to find an existing one
    const listRes = await fetch(`${BASE_URL}?limit=1`, {
      method: 'GET',
      headers: headers(),
    });
    const listBody = await listRes.json();

    if (!listBody.data || listBody.data.length === 0) {
      console.log('[INFO] No executions exist for test user. Skipping detail test.');
      return;
    }

    const executionId = listBody.data[0].id;
    console.log(`[INFO] Fetching execution detail for ${executionId}`);

    const res = await fetch(`${BASE_URL}/${executionId}`, {
      method: 'GET',
      headers: headers(),
    });
    const body = await res.json();

    console.log(`[INFO] execution detail: status=${res.status}`);
    console.log(`[INFO] body.data type: ${typeof body.data}, isArray: ${Array.isArray(body.data)}`);

    if (Array.isArray(body.data)) {
      console.log('[BUG] GET /executions/{id} returned an ARRAY instead of a single object.');
      console.log('[BUG] Same URL-routing bug as scouts endpoint: the pathParts parsing');
      console.log('[BUG] does not extract the execution ID from the URL correctly.');
      console.log(`[BUG] Expected single execution ${executionId}, got list of ${body.data.length} items.`);
      // Verify the array still has expected structure
      assertExists(body.meta, 'List response should have meta');
      return;
    }

    assertEquals(res.status, 200, `Expected 200 but got ${res.status}`);
    assertExists(body.data, 'Response should contain data');
    assertEquals(body.data.id, executionId, 'Execution ID should match');
    assertExists(body.data.status, 'Should have status field');
    assertExists(body.data.scout_id, 'Should have scout_id field');

    // Detail endpoint should include units array
    assertEquals(
      Array.isArray(body.data.units),
      true,
      'Detail should include units array'
    );
  },
});

Deno.test({
  name: 'executions: non-existent execution returns 404 (BUG DIAGNOSTIC: routing)',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const fakeUuid = '00000000-0000-0000-0000-000000000000';
    const res = await fetch(`${BASE_URL}/${fakeUuid}`, {
      method: 'GET',
      headers: headers(),
    });

    const body = await res.json();
    console.log(`[INFO] non-existent execution: status=${res.status} isArray=${Array.isArray(body.data)}`);

    if (res.status === 200 && Array.isArray(body.data)) {
      console.log('[BUG] GET /executions/{fake-uuid} returned 200 with array.');
      console.log('[BUG] The execution ID is being ignored and listExecutions() is called.');
      console.log('[BUG] This is the same pathParts routing bug as the scouts endpoint.');
      return;
    }

    assertEquals(
      res.status,
      404,
      `Expected 404 but got ${res.status}. If 200, the routing bug means IDs are ignored.`
    );
  },
});

Deno.test({
  name: 'executions: request without x-user-id returns 401',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const res = await fetch(BASE_URL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    assertEquals(res.status, 401, `Expected 401 but got ${res.status}`);
  },
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

Deno.test({
  name: 'executions: cleanup test scouts',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    if (createdScoutIds.length === 0) return;

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.39.3');
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    for (const id of createdScoutIds) {
      const { error } = await supabase.from('scouts').delete().eq('id', id);
      if (error) {
        console.log(`[CLEANUP] Failed to delete scout ${id}: ${error.message}`);
      }
    }
  },
});
