/**
 * Audit: supabase-js .contains() on JSONB array columns
 *
 * bajour_drafts.whatsapp_message_ids is JSONB (not TEXT[]).
 * supabase-js .contains(col, [val]) generates cs.{val} (PG array literal),
 * but JSONB needs cs.["val"] (JSON literal). This test confirms the bug
 * and validates working alternatives.
 *
 * Findings (URL-level, no DB needed):
 *   .contains(col, [wamid])              → cs.{wamid}     ← WRONG (PG array)
 *   .contains(col, JSON.stringify([...]))  → cs.["wamid"]   ← CORRECT (JSON)
 *   .filter(col, 'cs', JSON.stringify([])) → cs.["wamid"]   ← CORRECT (JSON)
 *
 * Run against real DB:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     deno test --allow-net --allow-env jsonb_contains_audit_test.ts
 */

import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TEST_USER_ID = 'audit-jsonb-contains';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Test data
const WAMID_1 = 'wamid.AUDIT_TEMPLATE_001';
const WAMID_2 = 'wamid.AUDIT_TEXT_001';
const WAMID_3 = 'wamid.AUDIT_TEMPLATE_002';
const WAMID_4 = 'wamid.AUDIT_TEXT_002';
const ALL_WAMIDS = [WAMID_1, WAMID_2, WAMID_3, WAMID_4];
const BAD_WAMID = 'wamid.DOES_NOT_EXIST_999';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

Deno.test({
  name: 'setup: insert draft with JSONB whatsapp_message_ids',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Clean any leftovers from previous runs
    await supabase.from('bajour_drafts').delete().eq('user_id', TEST_USER_ID);

    const { data, error } = await supabase
      .from('bajour_drafts')
      .insert({
        user_id: TEST_USER_ID,
        village_id: 'audit-village',
        village_name: 'Audit Village',
        title: 'JSONB contains audit',
        body: 'Test body',
        selected_unit_ids: [],
        verification_status: 'ausstehend',
        verification_sent_at: new Date().toISOString(),
        verification_timeout_at: new Date(Date.now() + 3600_000).toISOString(),
        whatsapp_message_ids: ALL_WAMIDS,
        verification_responses: [],
      })
      .select('id, whatsapp_message_ids')
      .single();

    assertEquals(error, null, `Insert failed: ${JSON.stringify(error)}`);
    assertExists(data, 'Insert should return data');
    assertEquals(Array.isArray(data.whatsapp_message_ids), true);
    assertEquals(data.whatsapp_message_ids.length, 4);
    console.log(`[SETUP] Draft ${data.id} created`);
  },
});

// ---------------------------------------------------------------------------
// BUG: .contains(col, [val]) uses PG array syntax → silent no-match on JSONB
// ---------------------------------------------------------------------------

Deno.test({
  name: 'BUG: .contains(col, [wamid]) generates cs.{} — no match on JSONB',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { data, error } = await supabase
      .from('bajour_drafts')
      .select('id')
      .contains('whatsapp_message_ids', [WAMID_1])
      .eq('user_id', TEST_USER_ID)
      .maybeSingle();

    console.log(`[BUG] .contains(col, [wamid]) → error: ${JSON.stringify(error)}, data: ${JSON.stringify(data)}`);

    // This SHOULD match but DOESN'T because PostgREST gets cs.{wamid}
    // which is PG array literal, not JSON. PostgREST silently returns no rows.
    // If this starts passing, the bug is fixed in a newer postgrest-js version.
    assertEquals(data, null, 'Expected no match (known bug: PG array syntax on JSONB)');
  },
});

// ---------------------------------------------------------------------------
// FIX 1: .contains(col, JSON.stringify([val])) — correct JSON syntax
// ---------------------------------------------------------------------------

Deno.test({
  name: 'FIX 1: .contains(col, JSON.stringify([wamid])) — matches JSONB',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { data, error } = await supabase
      .from('bajour_drafts')
      .select('id')
      .contains('whatsapp_message_ids', JSON.stringify([WAMID_1]))
      .eq('user_id', TEST_USER_ID)
      .maybeSingle();

    console.log(`[FIX 1] .contains(col, JSON.stringify) → error: ${JSON.stringify(error)}, data: ${JSON.stringify(data)}`);
    assertEquals(error, null, 'Should not error');
    assertExists(data, 'Should match the draft');
    console.log(`[FIX 1] PASS — matched draft ${data.id}`);
  },
});

// ---------------------------------------------------------------------------
// FIX 2: .filter(col, 'cs', JSON.stringify([val])) — explicit PostgREST
// ---------------------------------------------------------------------------

Deno.test({
  name: 'FIX 2: .filter(col, "cs", JSON.stringify([wamid])) — matches JSONB',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { data, error } = await supabase
      .from('bajour_drafts')
      .select('id')
      .filter('whatsapp_message_ids', 'cs', JSON.stringify([WAMID_1]))
      .eq('user_id', TEST_USER_ID)
      .maybeSingle();

    console.log(`[FIX 2] .filter(col, 'cs', ...) → error: ${JSON.stringify(error)}, data: ${JSON.stringify(data)}`);
    assertEquals(error, null, 'Should not error');
    assertExists(data, 'Should match the draft');
    console.log(`[FIX 2] PASS — matched draft ${data.id}`);
  },
});

// ---------------------------------------------------------------------------
// FIX 3: fetch-all + JS includes — always works (client-side)
// ---------------------------------------------------------------------------

Deno.test({
  name: 'FIX 3: fetch all + Array.includes() — client-side match',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { data, error } = await supabase
      .from('bajour_drafts')
      .select('id, whatsapp_message_ids')
      .eq('verification_status', 'ausstehend')
      .not('verification_sent_at', 'is', null)
      .eq('user_id', TEST_USER_ID);

    assertEquals(error, null);
    const match = (data || []).find((d: Record<string, unknown>) => {
      const ids = d.whatsapp_message_ids;
      return Array.isArray(ids) && ids.includes(WAMID_1);
    });

    assertExists(match, 'JS includes() should find the draft');
    console.log(`[FIX 3] PASS — matched draft ${match.id}`);
  },
});

// ---------------------------------------------------------------------------
// Match non-first element (index 2)
// ---------------------------------------------------------------------------

Deno.test({
  name: 'FIX 1 matches wamid at any array position (not just first)',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { data, error } = await supabase
      .from('bajour_drafts')
      .select('id')
      .contains('whatsapp_message_ids', JSON.stringify([WAMID_3]))
      .eq('user_id', TEST_USER_ID)
      .maybeSingle();

    assertEquals(error, null);
    assertExists(data, 'Should match wamid at index 2');
    console.log(`[POSITION] PASS — matched wamid at index 2`);
  },
});

// ---------------------------------------------------------------------------
// Negative: nonexistent wamid should not match
// ---------------------------------------------------------------------------

Deno.test({
  name: 'negative: nonexistent wamid returns null',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { data, error } = await supabase
      .from('bajour_drafts')
      .select('id')
      .contains('whatsapp_message_ids', JSON.stringify([BAD_WAMID]))
      .eq('user_id', TEST_USER_ID)
      .maybeSingle();

    assertEquals(error, null);
    assertEquals(data, null, 'Bad wamid should not match');
    console.log(`[NEGATIVE] PASS — no false positive`);
  },
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

Deno.test({
  name: 'cleanup: remove audit data',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { data, error } = await supabase
      .from('bajour_drafts')
      .delete()
      .eq('user_id', TEST_USER_ID)
      .select('id');

    if (error) {
      console.error(`[CLEANUP] Error: ${JSON.stringify(error)}`);
    } else {
      console.log(`[CLEANUP] Deleted ${data?.length ?? 0} audit drafts`);
    }
  },
});
