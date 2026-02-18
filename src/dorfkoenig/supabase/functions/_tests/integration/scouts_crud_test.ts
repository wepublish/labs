/**
 * Integration tests for the Scouts CRUD Edge Function.
 *
 * Calls the deployed endpoint at /functions/v1/scouts and validates
 * list, create, read, update, delete, validation, auth, and user-isolation behaviour.
 *
 * DIAGNOSTIC NOTE: Several tests may fail due to a URL-routing bug in the
 * deployed Edge Function where path segments after /scouts/ are not parsed
 * correctly. When GET /scouts/{id} returns the full list instead of a single
 * scout, or when DELETE/PUT /scouts/{id} returns 400 "Scout ID erforderlich",
 * this indicates the Edge Function is not extracting scoutId from the URL path.
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
const BASE_URL = `${SUPABASE_URL}/functions/v1/scouts`;

function headers(userId = TEST_USER_ID): HeadersInit {
  return {
    'Authorization': `Bearer ${ANON_KEY}`,
    'Content-Type': 'application/json',
    'x-user-id': userId,
  };
}

// Valid scout payload used across tests.
const VALID_SCOUT = {
  name: 'Integration Test Scout',
  url: 'https://example.com',
  criteria: 'Test criteria for integration testing',
  frequency: 'daily',
  location: { city: 'Zurich', country: 'Switzerland' },
  notification_email: null,
};

// Track IDs created during this test run for cleanup.
const createdScoutIds: string[] = [];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test({
  name: 'scouts: list scouts returns data array',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const res = await fetch(BASE_URL, { method: 'GET', headers: headers() });
    const body = await res.json();

    assertEquals(res.status, 200, `Expected 200 but got ${res.status}`);
    assertExists(body.data, 'Response should contain data field');
    assertEquals(Array.isArray(body.data), true, 'data should be an array');
  },
});

Deno.test({
  name: 'scouts: list scouts includes enrichment fields from latest execution',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Use tester-1 who has seed data with executions
    const res = await fetch(BASE_URL, {
      method: 'GET',
      headers: headers('tester-1'),
    });
    const body = await res.json();

    assertEquals(res.status, 200, `Expected 200 but got ${res.status}`);
    assertExists(body.data, 'Response should contain data field');
    assertEquals(Array.isArray(body.data), true, 'data should be an array');

    // Find scout s1 "Zürcher Medienmitteilungen" which has completed executions with criteria_matched: true
    const zurichScout = body.data.find(
      (s: Record<string, unknown>) =>
        s.id === 'aa000000-0001-4000-a000-000000000001'
    );

    if (zurichScout) {
      // Assert enrichment keys exist on the scout object
      assertEquals(
        'last_execution_status' in zurichScout,
        true,
        'Scout should have last_execution_status key'
      );
      assertEquals(
        'last_criteria_matched' in zurichScout,
        true,
        'Scout should have last_criteria_matched key'
      );
      assertEquals(
        'last_change_status' in zurichScout,
        true,
        'Scout should have last_change_status key'
      );
      assertEquals(
        'last_summary_text' in zurichScout,
        true,
        'Scout should have last_summary_text key'
      );

      // This scout has completed executions with criteria_matched: true
      assertEquals(
        zurichScout.last_execution_status,
        'completed',
        'Zürich scout should have last_execution_status = completed'
      );
      assertEquals(
        zurichScout.last_criteria_matched,
        true,
        'Zürich scout should have last_criteria_matched = true'
      );
      assertExists(
        zurichScout.last_change_status,
        'Zürich scout should have a non-null last_change_status'
      );
      assertExists(
        zurichScout.last_summary_text,
        'Zürich scout should have a non-null last_summary_text'
      );
    } else {
      console.log(
        '[WARN] Scout aa000000-0001-4000-a000-000000000001 not found for tester-1. ' +
          'Seed data may not be loaded. Skipping enrichment value assertions.'
      );
    }

    // Assert at least one scout in the response has non-null enrichment values
    const enrichedScout = body.data.find(
      (s: Record<string, unknown>) => s.last_execution_status !== null
    );
    assertExists(
      enrichedScout,
      'At least one scout should have non-null enrichment values'
    );
  },
});

Deno.test({
  name: 'scouts: create scout with empty criteria succeeds (criteria_mode = any)',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const emptyCriteriaScout = {
      name: 'Monitor-All Test Scout',
      url: 'https://example.com',
      criteria: '',
      frequency: 'daily',
      location: null,
      notification_email: null,
    };

    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(emptyCriteriaScout),
    });
    const body = await res.json();

    if (res.status !== 201) {
      console.log('[DIAG] create empty-criteria scout failed:', JSON.stringify(body));
    }

    assertEquals(res.status, 201, `Expected 201 but got ${res.status}`);
    assertExists(body.data, 'Response should contain data');
    assertEquals(body.data.criteria, '', 'Scout criteria should be empty string');

    // Track for cleanup
    createdScoutIds.push(body.data.id);
  },
});

Deno.test({
  name: 'scouts: create scout with valid body returns 201',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(VALID_SCOUT),
    });
    const body = await res.json();

    if (res.status !== 201) {
      console.log('[DIAG] create scout failed:', JSON.stringify(body));
    }

    assertEquals(res.status, 201, `Expected 201 but got ${res.status}`);
    assertExists(body.data, 'Response should contain data');
    assertExists(body.data.id, 'Scout should have id');
    assertEquals(body.data.name, VALID_SCOUT.name);
    assertEquals(body.data.url, VALID_SCOUT.url);
    assertEquals(body.data.criteria, VALID_SCOUT.criteria);
    assertEquals(body.data.frequency, VALID_SCOUT.frequency);

    // Track for cleanup
    createdScoutIds.push(body.data.id);
  },
});

Deno.test({
  name: 'scouts: create scout missing required fields returns 400',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ name: '' }), // missing url, criteria, frequency
    });

    assertEquals(res.status, 400, `Expected 400 but got ${res.status}`);
  },
});

Deno.test({
  name: 'scouts: create scout with invalid URL returns 400',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        ...VALID_SCOUT,
        url: 'not-a-valid-url',
      }),
    });

    assertEquals(res.status, 400, `Expected 400 but got ${res.status}`);
  },
});

Deno.test({
  name: 'scouts: get scout by ID (BUG DIAGNOSTIC: routing may not parse scoutId)',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Create a scout first
    const createRes = await fetch(BASE_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(VALID_SCOUT),
    });
    const created = await createRes.json();
    assertEquals(createRes.status, 201, 'Setup: create should succeed');
    const scoutId = created.data.id;
    createdScoutIds.push(scoutId);

    // Fetch it by ID
    const getUrl = `${BASE_URL}/${scoutId}`;
    console.log(`[DIAG] GET ${getUrl}`);
    const getRes = await fetch(getUrl, {
      method: 'GET',
      headers: headers(),
    });
    const body = await getRes.json();

    console.log(`[DIAG] GET /scouts/{id} status=${getRes.status}`);
    console.log(`[DIAG] Response body keys: ${JSON.stringify(Object.keys(body))}`);
    console.log(`[DIAG] body.data type: ${typeof body.data}, isArray: ${Array.isArray(body.data)}`);

    if (Array.isArray(body.data)) {
      console.log('[BUG] GET /scouts/{id} returned an ARRAY instead of a single object.');
      console.log('[BUG] This means the Edge Function is not extracting scoutId from the URL path.');
      console.log('[BUG] The pathParts parsing in scouts/index.ts likely has an off-by-one error');
      console.log('[BUG] in how it indexes the path segments relative to the actual URL structure');
      console.log('[BUG] seen by the Edge Function runtime.');
    }

    assertEquals(getRes.status, 200, `Expected 200 but got ${getRes.status}`);
    assertExists(body.data, 'Response should contain data');

    // This assertion documents the expected behavior (single object with matching ID).
    // If it fails with undefined, the routing bug is confirmed.
    assertEquals(
      body.data.id,
      scoutId,
      `Expected data.id to be ${scoutId} but got ${body.data.id}. ` +
      'If undefined, this confirms the URL routing bug: GET /scouts/{id} falls through to listScouts().'
    );
    assertEquals(body.data.name, VALID_SCOUT.name);
  },
});

Deno.test({
  name: 'scouts: update scout with partial body (BUG DIAGNOSTIC: routing)',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Create a scout first
    const createRes = await fetch(BASE_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(VALID_SCOUT),
    });
    const created = await createRes.json();
    assertEquals(createRes.status, 201, 'Setup: create should succeed');
    const scoutId = created.data.id;
    createdScoutIds.push(scoutId);

    // Update only the name
    const updateUrl = `${BASE_URL}/${scoutId}`;
    console.log(`[DIAG] PUT ${updateUrl}`);
    const updateRes = await fetch(updateUrl, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ name: 'Updated Integration Test Scout' }),
    });
    const updated = await updateRes.json();

    console.log(`[DIAG] PUT /scouts/{id} status=${updateRes.status} body=${JSON.stringify(updated).slice(0, 300)}`);

    if (updateRes.status === 400) {
      console.log('[BUG] PUT /scouts/{id} returned 400 "Scout ID erforderlich".');
      console.log('[BUG] The Edge Function cannot parse scoutId from the URL path.');
    }

    assertEquals(updateRes.status, 200, `Expected 200 but got ${updateRes.status}. Body: ${JSON.stringify(updated).slice(0, 200)}`);
    assertEquals(updated.data.name, 'Updated Integration Test Scout');
    assertEquals(updated.data.url, VALID_SCOUT.url);
  },
});

Deno.test({
  name: 'scouts: delete scout returns 204 (BUG DIAGNOSTIC: routing)',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Create a scout to delete
    const createRes = await fetch(BASE_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(VALID_SCOUT),
    });
    const created = await createRes.json();
    assertEquals(createRes.status, 201, 'Setup: create should succeed');
    const scoutId = created.data.id;

    // Delete it
    const deleteUrl = `${BASE_URL}/${scoutId}`;
    console.log(`[DIAG] DELETE ${deleteUrl}`);
    const deleteRes = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: headers(),
    });

    console.log(`[DIAG] DELETE /scouts/{id} status=${deleteRes.status}`);

    if (deleteRes.status === 400) {
      const body = await deleteRes.json();
      console.log(`[BUG] DELETE returned 400: ${JSON.stringify(body)}`);
      console.log('[BUG] The Edge Function cannot parse scoutId from the URL path.');
      // Track for cleanup anyway
      createdScoutIds.push(scoutId);
    }

    assertEquals(
      deleteRes.status,
      204,
      `Expected 204 but got ${deleteRes.status}. If 400, this is the URL routing bug.`
    );

    // Verify it is gone
    const getRes = await fetch(`${BASE_URL}/${scoutId}`, {
      method: 'GET',
      headers: headers(),
    });

    console.log(`[DIAG] GET after delete status=${getRes.status}`);
    assertEquals(getRes.status, 404, 'Deleted scout should return 404');
  },
});

Deno.test({
  name: 'scouts: get non-existent scout returns 404 (BUG DIAGNOSTIC: routing)',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const fakeUuid = '00000000-0000-0000-0000-000000000000';
    const res = await fetch(`${BASE_URL}/${fakeUuid}`, {
      method: 'GET',
      headers: headers(),
    });

    const body = await res.json();
    console.log(`[DIAG] GET /scouts/fake-uuid status=${res.status} isArray=${Array.isArray(body.data)}`);

    if (res.status === 200 && Array.isArray(body.data)) {
      console.log('[BUG] GET /scouts/{fake-uuid} returned 200 with array.');
      console.log('[BUG] The ID is being ignored and listScouts() is called instead.');
    }

    assertEquals(
      res.status,
      404,
      `Expected 404 but got ${res.status}. If 200, the routing bug means IDs are ignored.`
    );
  },
});

Deno.test({
  name: 'scouts: request without x-user-id returns 401',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const res = await fetch(BASE_URL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
        // No x-user-id header
      },
    });

    assertEquals(res.status, 401, `Expected 401 but got ${res.status}`);
  },
});

Deno.test({
  name: 'scouts: user isolation - user B cannot see user A scout (BUG DIAGNOSTIC: routing)',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Create scout as user A (default test user)
    const createRes = await fetch(BASE_URL, {
      method: 'POST',
      headers: headers(TEST_USER_ID),
      body: JSON.stringify(VALID_SCOUT),
    });
    const created = await createRes.json();
    assertEquals(createRes.status, 201, 'Setup: create should succeed');
    const scoutId = created.data.id;
    createdScoutIds.push(scoutId);

    // Try to GET as user B
    const otherUserHeaders = headers('other-user-isolation-test');
    const getRes = await fetch(`${BASE_URL}/${scoutId}`, {
      method: 'GET',
      headers: otherUserHeaders,
    });
    const body = await getRes.json();

    console.log(`[DIAG] Cross-user GET status=${getRes.status} isArray=${Array.isArray(body.data)}`);

    if (getRes.status === 200 && Array.isArray(body.data)) {
      console.log('[BUG] Cross-user GET returned 200 with array.');
      console.log('[BUG] Due to routing bug, /scouts/{id} falls through to listScouts()');
      console.log('[BUG] which returns user B empty list (correct isolation at list level).');
      console.log('[BUG] But the ID-level isolation cannot be tested until routing is fixed.');
    }

    assertEquals(
      getRes.status,
      404,
      `Expected 404 for cross-user access but got ${getRes.status}. ` +
      'If 200, this is the routing bug (listScouts returns empty array for other user).'
    );
  },
});

// ---------------------------------------------------------------------------
// Cleanup: delete all scouts created during this test run via service role
// ---------------------------------------------------------------------------

Deno.test({
  name: 'scouts: cleanup test-created scouts',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    console.log(`[CLEANUP] Deleting ${createdScoutIds.length} scout(s) created during tests`);

    // Since DELETE /scouts/{id} has the routing bug, use the Supabase client directly
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.39.3');
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    for (const id of createdScoutIds) {
      const { error } = await supabase.from('scouts').delete().eq('id', id);
      if (error) {
        console.log(`[CLEANUP] Failed to delete scout ${id}: ${error.message}`);
      } else {
        console.log(`[CLEANUP] Deleted scout ${id}`);
      }
    }
  },
});
