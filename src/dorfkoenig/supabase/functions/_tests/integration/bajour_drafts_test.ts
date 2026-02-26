/**
 * Integration tests for the Bajour Drafts Edge Function.
 *
 * Calls the deployed endpoint at /functions/v1/bajour-drafts and validates
 * list, create, update (PATCH), verification status override, validation,
 * and auth behaviour.
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
const TEST_USER_ID = 'test-runner-bajour-drafts';
const BASE_URL = `${SUPABASE_URL}/functions/v1/bajour-drafts`;

function headers(userId = TEST_USER_ID): HeadersInit {
  return {
    'Authorization': `Bearer ${ANON_KEY}`,
    'Content-Type': 'application/json',
    'x-user-id': userId,
  };
}

const VALID_DRAFT = {
  village_id: 'riehen',
  village_name: 'Riehen',
  title: 'Integration Test Entwurf',
  body: 'Testinhalt für den Integrationsentwurf.',
  selected_unit_ids: ['test-unit-1', 'test-unit-2'],
  custom_system_prompt: null,
};

// Track IDs created during this test run for cleanup.
const createdDraftIds: string[] = [];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test({
  name: 'bajour-drafts: list drafts returns data array',
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
  name: 'bajour-drafts: create draft returns 201 with draft object',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(VALID_DRAFT),
    });
    const body = await res.json();

    assertEquals(res.status, 201, `Expected 201 but got ${res.status}`);
    assertExists(body.data, 'Response should contain data');
    assertExists(body.data.id, 'Draft should have an id');
    assertEquals(body.data.village_id, 'riehen');
    assertEquals(body.data.village_name, 'Riehen');
    assertEquals(body.data.verification_status, 'ausstehend');
    assertEquals(Array.isArray(body.data.selected_unit_ids), true);

    createdDraftIds.push(body.data.id);
    console.log(`[INFO] Created draft: ${body.data.id}`);
  },
});

Deno.test({
  name: 'bajour-drafts: create draft validates required fields',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Missing village_id
    const res1 = await fetch(BASE_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ body: 'test', selected_unit_ids: [] }),
    });
    assertEquals(res1.status, 400, 'Missing village_id should return 400');

    // Missing body
    const res2 = await fetch(BASE_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        village_id: 'riehen',
        village_name: 'Riehen',
        selected_unit_ids: [],
      }),
    });
    assertEquals(res2.status, 400, 'Missing body should return 400');

    // Missing selected_unit_ids
    const res3 = await fetch(BASE_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        village_id: 'riehen',
        village_name: 'Riehen',
        body: 'test',
      }),
    });
    assertEquals(res3.status, 400, 'Missing selected_unit_ids should return 400');
  },
});

Deno.test({
  name: 'bajour-drafts: PATCH updates verification_status to bestätigt',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // First create a draft to update
    const createRes = await fetch(BASE_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(VALID_DRAFT),
    });
    const createBody = await createRes.json();
    assertEquals(createRes.status, 201);
    const draftId = createBody.data.id;
    createdDraftIds.push(draftId);

    // PATCH to bestätigt
    const patchRes = await fetch(`${BASE_URL}/${draftId}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ verification_status: 'bestätigt' }),
    });
    const patchBody = await patchRes.json();

    assertEquals(patchRes.status, 200, `Expected 200 but got ${patchRes.status}`);
    assertExists(patchBody.data, 'Response should contain data');
    assertEquals(patchBody.data.id, draftId, 'Should return the same draft');
    assertEquals(
      patchBody.data.verification_status,
      'bestätigt',
      'Status should be bestätigt'
    );

    console.log(`[INFO] Updated draft ${draftId} to bestätigt`);
  },
});

Deno.test({
  name: 'bajour-drafts: PATCH updates verification_status to abgelehnt',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // First create a draft to update
    const createRes = await fetch(BASE_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(VALID_DRAFT),
    });
    const createBody = await createRes.json();
    assertEquals(createRes.status, 201);
    const draftId = createBody.data.id;
    createdDraftIds.push(draftId);

    // PATCH to abgelehnt
    const patchRes = await fetch(`${BASE_URL}/${draftId}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ verification_status: 'abgelehnt' }),
    });
    const patchBody = await patchRes.json();

    assertEquals(patchRes.status, 200, `Expected 200 but got ${patchRes.status}`);
    assertEquals(
      patchBody.data.verification_status,
      'abgelehnt',
      'Status should be abgelehnt'
    );

    console.log(`[INFO] Updated draft ${draftId} to abgelehnt`);
  },
});

Deno.test({
  name: 'bajour-drafts: PATCH with no changes returns 400',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Create a draft first
    const createRes = await fetch(BASE_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(VALID_DRAFT),
    });
    const createBody = await createRes.json();
    assertEquals(createRes.status, 201);
    const draftId = createBody.data.id;
    createdDraftIds.push(draftId);

    // PATCH with empty body
    const patchRes = await fetch(`${BASE_URL}/${draftId}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({}),
    });

    assertEquals(patchRes.status, 400, 'Empty PATCH should return 400');
  },
});

Deno.test({
  name: 'bajour-drafts: PATCH without draft ID returns 400',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const res = await fetch(BASE_URL, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ verification_status: 'bestätigt' }),
    });

    assertEquals(res.status, 400, 'PATCH without ID should return 400');
  },
});

Deno.test({
  name: 'bajour-drafts: PATCH non-existent draft returns 404',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const res = await fetch(`${BASE_URL}/00000000-0000-0000-0000-000000000000`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ verification_status: 'bestätigt' }),
    });

    assertEquals(res.status, 404, 'Non-existent draft should return 404');
  },
});

Deno.test({
  name: 'bajour-drafts: verified draft persists on reload',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Create and verify a draft
    const createRes = await fetch(BASE_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(VALID_DRAFT),
    });
    const createBody = await createRes.json();
    const draftId = createBody.data.id;
    createdDraftIds.push(draftId);

    // Set to bestätigt
    await fetch(`${BASE_URL}/${draftId}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ verification_status: 'bestätigt' }),
    });

    // Reload list and check
    const listRes = await fetch(BASE_URL, { method: 'GET', headers: headers() });
    const listBody = await listRes.json();

    const draft = listBody.data.find(
      (d: Record<string, unknown>) => d.id === draftId
    );
    assertExists(draft, 'Draft should exist in list');
    assertEquals(
      draft.verification_status,
      'bestätigt',
      'Status should persist as bestätigt after reload'
    );

    console.log(`[INFO] Verified draft ${draftId} persists after reload`);
  },
});

Deno.test({
  name: 'bajour-drafts: user isolation — cannot update another user draft',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Create a draft as the test user
    const createRes = await fetch(BASE_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(VALID_DRAFT),
    });
    const createBody = await createRes.json();
    const draftId = createBody.data.id;
    createdDraftIds.push(draftId);

    // Try to PATCH as a different user
    const patchRes = await fetch(`${BASE_URL}/${draftId}`, {
      method: 'PATCH',
      headers: headers('other-user-bajour-test'),
      body: JSON.stringify({ verification_status: 'bestätigt' }),
    });

    assertEquals(
      patchRes.status,
      404,
      'Updating another user draft should return 404'
    );
  },
});

Deno.test({
  name: 'bajour-drafts: request without x-user-id returns 401',
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
  name: 'bajour-drafts: cleanup test data',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { createClient } = await import(
      'https://esm.sh/@supabase/supabase-js@2.39.3'
    );
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Delete all drafts created by the test users
    for (const userId of [TEST_USER_ID, 'other-user-bajour-test']) {
      const { data, error } = await supabase
        .from('bajour_drafts')
        .delete()
        .eq('user_id', userId)
        .select('id');

      if (error) {
        console.error(`[CLEANUP] Error deleting drafts for ${userId}:`, error);
      } else {
        console.log(
          `[CLEANUP] Deleted ${data?.length ?? 0} drafts for ${userId}`
        );
      }
    }

    console.log(
      `[CLEANUP] Tracked ${createdDraftIds.length} draft IDs during test run`
    );
  },
});
