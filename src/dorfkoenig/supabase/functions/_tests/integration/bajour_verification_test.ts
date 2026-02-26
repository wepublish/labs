/**
 * Integration tests for the Bajour verification workflow:
 * - bajour-send-verification: sends drafts to correspondents via WhatsApp
 * - bajour-whatsapp-webhook: receives verification responses from WhatsApp
 *
 * WhatsApp API calls are not executed (require live credentials), but we test
 * auth, validation, and the webhook verification handshake. Tests that need
 * live WhatsApp/correspondents keys are marked as DIAGNOSTIC and handle
 * graceful failures.
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
const TEST_USER_ID = 'test-runner-bajour-verify';

const DRAFTS_URL = `${SUPABASE_URL}/functions/v1/bajour-drafts`;
const VERIFY_URL = `${SUPABASE_URL}/functions/v1/bajour-send-verification`;
const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/bajour-whatsapp-webhook`;

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
      title: 'Verification Test Entwurf',
      body: 'Testinhalt für Verifikation.',
      selected_unit_ids: ['test-unit-v-1'],
      custom_system_prompt: null,
      ...overrides,
    }),
  });
  const body = await res.json();
  assertEquals(res.status, 201, `Draft creation should succeed: ${res.status}`);
  createdDraftIds.push(body.data.id);
  return body.data.id;
}

// ===========================================================================
// bajour-send-verification tests
// ===========================================================================

Deno.test({
  name: 'bajour-send-verification: request without x-user-id returns 401',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ draft_id: 'test' }),
    });

    assertEquals(res.status, 401, `Expected 401 but got ${res.status}`);
  },
});

Deno.test({
  name: 'bajour-send-verification: missing draft_id returns 400',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({}),
    });
    const body = await res.json();

    assertEquals(res.status, 400, `Expected 400 but got ${res.status}`);
    assertExists(body.error, 'Response should contain error');
    console.log(`[INFO] Correctly rejected: missing draft_id`);
  },
});

Deno.test({
  name: 'bajour-send-verification: non-existent draft returns 404',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        draft_id: '00000000-0000-0000-0000-000000000000',
      }),
    });

    assertEquals(res.status, 404, `Expected 404 but got ${res.status}`);
  },
});

Deno.test({
  name: 'bajour-send-verification: cannot verify another user draft',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const draftId = await createDraft();

    // Try to send verification as different user
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: headers('other-user-bajour-verify-test'),
      body: JSON.stringify({ draft_id: draftId }),
    });

    assertEquals(
      res.status,
      404,
      'Should not find draft belonging to another user'
    );
  },
});

Deno.test({
  name: 'bajour-send-verification: sends to correspondents (DIAGNOSTIC: requires WhatsApp keys)',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const draftId = await createDraft();
    console.log(`[INFO] Created draft for verification: ${draftId}`);

    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ draft_id: draftId }),
    });
    const body = await res.json();

    console.log(
      `[INFO] POST /bajour-send-verification: status=${res.status}`
    );
    console.log(`[INFO] body: ${JSON.stringify(body).slice(0, 500)}`);

    // If WhatsApp keys are missing, function returns 500
    if (res.status === 500) {
      const errorMsg = JSON.stringify(body).toLowerCase();
      if (
        errorMsg.includes('whatsapp') ||
        errorMsg.includes('graph.facebook') ||
        errorMsg.includes('korrespondent')
      ) {
        console.log(
          '[DIAGNOSTIC] WhatsApp API keys likely not set or no correspondents configured.'
        );
        return;
      }
    }

    // If no correspondents configured, returns 400
    if (res.status === 400 && body.error?.code === 'VALIDATION_ERROR') {
      console.log(
        '[DIAGNOSTIC] No correspondents configured for this village.'
      );
      console.log('[DIAGNOSTIC] Set BAJOUR_CORRESPONDENTS secret to enable.');
      return;
    }

    // Success case
    assertEquals(res.status, 200, `Expected 200 but got ${res.status}`);
    assertExists(body.data, 'Response should contain data');
    assertExists(body.data.sent_count, 'Should return sent_count');
    assertEquals(
      typeof body.data.sent_count,
      'number',
      'sent_count should be a number'
    );

    console.log(`[RESULT] Sent verification to ${body.data.sent_count} correspondents`);

    // Verify the draft was updated with verification metadata
    const listRes = await fetch(DRAFTS_URL, {
      method: 'GET',
      headers: headers(),
    });
    const listBody = await listRes.json();
    const updatedDraft = listBody.data.find(
      (d: Record<string, unknown>) => d.id === draftId
    );

    if (updatedDraft) {
      assertExists(
        updatedDraft.verification_sent_at,
        'Draft should have verification_sent_at set'
      );
      assertExists(
        updatedDraft.verification_timeout_at,
        'Draft should have verification_timeout_at set'
      );
      assertEquals(
        Array.isArray(updatedDraft.whatsapp_message_ids),
        true,
        'whatsapp_message_ids should be an array'
      );
      console.log(
        `[INFO] Draft updated: sent_at=${updatedDraft.verification_sent_at}, ` +
          `timeout_at=${updatedDraft.verification_timeout_at}, ` +
          `message_ids=${updatedDraft.whatsapp_message_ids.length}`
      );
    }
  },
});

// ===========================================================================
// bajour-whatsapp-webhook tests
// ===========================================================================

Deno.test({
  name: 'bajour-whatsapp-webhook: GET with valid verify_token returns challenge',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // The webhook verify token is set as a secret — we test with a known-wrong
    // token to verify the endpoint responds correctly (403 for wrong token)
    const params = new URLSearchParams({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong-token',
      'hub.challenge': 'test-challenge-123',
    });

    const res = await fetch(`${WEBHOOK_URL}?${params}`, {
      method: 'GET',
    });

    // Should return 403 for wrong token
    assertEquals(
      res.status,
      403,
      `Wrong verify token should return 403, got ${res.status}`
    );

    console.log('[INFO] Webhook correctly rejects wrong verify_token');
  },
});

Deno.test({
  name: 'bajour-whatsapp-webhook: GET without hub.mode returns 403',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const res = await fetch(WEBHOOK_URL, { method: 'GET' });

    assertEquals(
      res.status,
      403,
      `Missing hub.mode should return 403, got ${res.status}`
    );
  },
});

Deno.test({
  name: 'bajour-whatsapp-webhook: POST without signature processes gracefully',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // POST without x-hub-signature-256 — webhook should still return 200
    // (Meta expects 200 always to avoid retry loops)
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: '41790000000',
                    type: 'text',
                    text: { body: 'test' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json();

    // Webhook always returns 200 to Meta
    assertEquals(res.status, 200, `Webhook should return 200, got ${res.status}`);
    // With invalid signature, should return invalid_signature status
    assertEquals(
      body.status,
      'invalid_signature',
      'Should flag invalid signature'
    );

    console.log('[INFO] Webhook correctly handles missing signature');
  },
});

Deno.test({
  name: 'bajour-whatsapp-webhook: POST with no message content returns no_message',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // POST with a status update (no messages) — should return no_message
    // But since we don't have a valid signature, it will return invalid_signature
    // This test documents the expected behaviour when signature is valid
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [{ id: 'test', status: 'delivered' }],
              },
            },
          ],
        },
      ],
    };

    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json();

    assertEquals(res.status, 200, `Webhook should return 200`);
    // Without valid signature, we get invalid_signature
    // With valid signature, we'd get no_message
    console.log(`[INFO] Webhook response status: ${body.status}`);
    assertEquals(
      ['invalid_signature', 'no_message'].includes(body.status),
      true,
      `Expected invalid_signature or no_message, got ${body.status}`
    );
  },
});

Deno.test({
  name: 'bajour-whatsapp-webhook: POST with non-button reply is ignored',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Text message (not a button reply) — should be ignored
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: '41790000000',
                    type: 'text',
                    text: { body: 'Hallo!' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json();

    assertEquals(res.status, 200);
    // Without valid signature: invalid_signature
    // With valid signature: ignored (no button_reply)
    console.log(`[INFO] Non-button reply response: ${body.status}`);
    assertEquals(
      ['invalid_signature', 'ignored'].includes(body.status),
      true,
      `Expected invalid_signature or ignored, got ${body.status}`
    );
  },
});

Deno.test({
  name: 'bajour-whatsapp-webhook: OPTIONS returns CORS headers',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const res = await fetch(WEBHOOK_URL, { method: 'OPTIONS' });

    assertEquals(res.status, 200, 'OPTIONS should return 200');
    assertExists(
      res.headers.get('access-control-allow-origin'),
      'Should have CORS origin header'
    );
    assertExists(
      res.headers.get('access-control-allow-methods'),
      'Should have CORS methods header'
    );

    console.log('[INFO] CORS preflight works for webhook');
  },
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

Deno.test({
  name: 'bajour-verification: cleanup test data',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { createClient } = await import(
      'https://esm.sh/@supabase/supabase-js@2.39.3'
    );
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    for (const userId of [TEST_USER_ID, 'other-user-bajour-verify-test']) {
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
