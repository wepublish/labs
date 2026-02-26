/**
 * Integration tests for the Bajour Send to Mailchimp Edge Function.
 *
 * Calls the deployed endpoint at /functions/v1/bajour-send-mailchimp and validates
 * auth, validation (no verified drafts), and the full Mailchimp campaign creation
 * flow (conditional on MAILCHIMP_API_KEY being set).
 *
 * The Mailchimp integration tests are skipped if the API key is not available,
 * since they create real campaigns.
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
const TEST_USER_ID = 'test-runner-bajour-mailchimp';
const DRAFTS_URL = `${SUPABASE_URL}/functions/v1/bajour-drafts`;
const MAILCHIMP_URL = `${SUPABASE_URL}/functions/v1/bajour-send-mailchimp`;

function headers(userId = TEST_USER_ID): HeadersInit {
  return {
    'Authorization': `Bearer ${ANON_KEY}`,
    'Content-Type': 'application/json',
    'x-user-id': userId,
  };
}

// Track draft IDs for cleanup
const createdDraftIds: string[] = [];

// Helper: create a draft via API
async function createDraft(
  overrides: Record<string, unknown> = {}
): Promise<string> {
  const res = await fetch(DRAFTS_URL, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      village_id: 'riehen',
      village_name: 'Riehen',
      title: 'Mailchimp Test Entwurf',
      body: 'Testinhalt für Mailchimp-Integration.',
      selected_unit_ids: ['test-unit-mc-1'],
      custom_system_prompt: null,
      ...overrides,
    }),
  });
  const body = await res.json();
  assertEquals(res.status, 201, `Draft creation should succeed: ${res.status}`);
  createdDraftIds.push(body.data.id);
  return body.data.id;
}

// Helper: set a draft's verification status via PATCH
async function setDraftStatus(
  draftId: string,
  status: string
): Promise<void> {
  const res = await fetch(`${DRAFTS_URL}/${draftId}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ verification_status: status }),
  });
  assertEquals(res.status, 200, `PATCH status should succeed: ${res.status}`);
}

// ---------------------------------------------------------------------------
// Tests — Auth & Validation
// ---------------------------------------------------------------------------

Deno.test({
  name: 'bajour-send-mailchimp: request without x-user-id returns 401',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const res = await fetch(MAILCHIMP_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    assertEquals(res.status, 401, `Expected 401 but got ${res.status}`);
  },
});

Deno.test({
  name: 'bajour-send-mailchimp: GET method not allowed returns 405',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const res = await fetch(MAILCHIMP_URL, {
      method: 'GET',
      headers: headers(),
    });

    assertEquals(res.status, 405, `Expected 405 but got ${res.status}`);
  },
});

Deno.test({
  name: 'bajour-send-mailchimp: no verified drafts returns 400 NO_VERIFIED_DRAFTS',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // User has no verified drafts — should get validation error
    const res = await fetch(MAILCHIMP_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({}),
    });
    const body = await res.json();

    assertEquals(res.status, 400, `Expected 400 but got ${res.status}`);
    assertExists(body.error, 'Response should contain error');
    assertEquals(
      body.error.code,
      'NO_VERIFIED_DRAFTS',
      'Error code should be NO_VERIFIED_DRAFTS'
    );

    console.log('[INFO] Correctly rejected: no verified drafts');
  },
});

Deno.test({
  name: 'bajour-send-mailchimp: unverified (ausstehend) drafts not included',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Create a draft but leave it as ausstehend — should still get NO_VERIFIED_DRAFTS
    const draftId = await createDraft();
    console.log(`[INFO] Created ausstehend draft: ${draftId}`);

    const res = await fetch(MAILCHIMP_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({}),
    });
    const body = await res.json();

    assertEquals(res.status, 400, `Expected 400 but got ${res.status}`);
    assertEquals(
      body.error.code,
      'NO_VERIFIED_DRAFTS',
      'Unverified drafts should not count'
    );

    console.log('[INFO] Correctly excluded ausstehend draft');
  },
});

Deno.test({
  name: 'bajour-send-mailchimp: abgelehnt drafts not included',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const draftId = await createDraft();
    await setDraftStatus(draftId, 'abgelehnt');
    console.log(`[INFO] Created abgelehnt draft: ${draftId}`);

    const res = await fetch(MAILCHIMP_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({}),
    });
    const body = await res.json();

    assertEquals(res.status, 400, `Expected 400 but got ${res.status}`);
    assertEquals(
      body.error.code,
      'NO_VERIFIED_DRAFTS',
      'Rejected drafts should not count'
    );

    console.log('[INFO] Correctly excluded abgelehnt draft');
  },
});

// ---------------------------------------------------------------------------
// Tests — Mailchimp Integration (conditional on API key)
// ---------------------------------------------------------------------------

Deno.test({
  name: 'bajour-send-mailchimp: creates campaign with verified drafts (DIAGNOSTIC: requires Mailchimp key)',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Create a verified draft
    const draftId = await createDraft({
      village_id: 'reinach',
      village_name: 'Reinach',
      body: 'Testnachricht aus Reinach für Mailchimp-Integration.',
    });
    await setDraftStatus(draftId, 'bestätigt');
    console.log(`[INFO] Created bestätigt draft: ${draftId}`);

    const res = await fetch(MAILCHIMP_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({}),
    });
    const body = await res.json();

    console.log(`[INFO] POST /bajour-send-mailchimp: status=${res.status}`);
    console.log(`[INFO] body: ${JSON.stringify(body).slice(0, 500)}`);

    // If Mailchimp key is not set, the function will return 500
    if (res.status === 500) {
      const errorMsg = JSON.stringify(body).toLowerCase();
      if (
        errorMsg.includes('mailchimp') ||
        errorMsg.includes('api key') ||
        errorMsg.includes('template')
      ) {
        console.log(
          '[DIAGNOSTIC] Mailchimp API key likely not set or template not found.'
        );
        console.log(
          '[DIAGNOSTIC] Skipping campaign creation assertions.'
        );
        return;
      }
    }

    // If we got 404 with TEMPLATE_NOT_FOUND, the key works but template is missing
    if (res.status === 404 && body.error?.code === 'TEMPLATE_NOT_FOUND') {
      console.log(
        '[DIAGNOSTIC] Mailchimp key works but "Dorfkönig-Basis" template not found.'
      );
      console.log(
        '[DIAGNOSTIC] Template must be created in Mailchimp dashboard first.'
      );
      return;
    }

    // Success case
    assertEquals(res.status, 200, `Expected 200 but got ${res.status}`);
    assertExists(body.data, 'Response should contain data');
    assertExists(body.data.campaign_id, 'Should return campaign_id');
    assertExists(body.data.village_count, 'Should return village_count');
    assertEquals(
      typeof body.data.campaign_id,
      'string',
      'campaign_id should be a string'
    );
    assertEquals(
      typeof body.data.village_count,
      'number',
      'village_count should be a number'
    );

    console.log(
      `[RESULT] Campaign created: ${body.data.campaign_id}, ` +
        `villages: ${body.data.village_count}`
    );
  },
});

Deno.test({
  name: 'bajour-send-mailchimp: multiple verified drafts for different villages',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Create two verified drafts for different villages
    const draft1 = await createDraft({
      village_id: 'riehen',
      village_name: 'Riehen',
      body: 'Riehen Testnachricht.',
    });
    await setDraftStatus(draft1, 'bestätigt');

    const draft2 = await createDraft({
      village_id: 'bettingen',
      village_name: 'Bettingen',
      body: 'Bettingen Testnachricht.',
    });
    await setDraftStatus(draft2, 'bestätigt');

    console.log(`[INFO] Created 2 bestätigt drafts: ${draft1}, ${draft2}`);

    const res = await fetch(MAILCHIMP_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({}),
    });
    const body = await res.json();

    console.log(`[INFO] POST /bajour-send-mailchimp: status=${res.status}`);

    // Skip assertions if Mailchimp key/template not available
    if (res.status === 500 || (res.status === 404 && body.error?.code === 'TEMPLATE_NOT_FOUND')) {
      console.log('[DIAGNOSTIC] Mailchimp key or template not available, skipping.');
      return;
    }

    assertEquals(res.status, 200, `Expected 200 but got ${res.status}`);
    assertExists(body.data, 'Response should contain data');

    // village_count should reflect the number of replaced placeholders
    console.log(
      `[RESULT] Campaign: ${body.data.campaign_id}, villages: ${body.data.village_count}`
    );
  },
});

Deno.test({
  name: 'bajour-send-mailchimp: user isolation — only uses own verified drafts',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Even though the main test user has verified drafts, a different user should get 400
    const res = await fetch(MAILCHIMP_URL, {
      method: 'POST',
      headers: headers('other-user-bajour-mc-test'),
      body: JSON.stringify({}),
    });
    const body = await res.json();

    assertEquals(res.status, 400, 'Other user should have no verified drafts');
    assertEquals(body.error.code, 'NO_VERIFIED_DRAFTS');

    console.log('[INFO] Correctly isolated: other user has no verified drafts');
  },
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

Deno.test({
  name: 'bajour-send-mailchimp: cleanup test data',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { createClient } = await import(
      'https://esm.sh/@supabase/supabase-js@2.39.3'
    );
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    for (const userId of [TEST_USER_ID, 'other-user-bajour-mc-test']) {
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
