/**
 * Final cleanup test -- deletes ALL data created by the test-runner-integration user.
 *
 * This should run LAST. It uses the Supabase JS client with the service role key
 * to bypass RLS and clean up scouts (which cascade-deletes executions and units).
 */

import { assertEquals } from 'https://deno.land/std@0.220.0/assert/mod.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TEST_USER_ID = 'test-runner-integration';

Deno.test({
  name: 'cleanup: delete all test-runner-integration scouts and related data',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { createClient } = await import(
      'https://esm.sh/@supabase/supabase-js@2.39.3'
    );

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // First, count what we are about to delete
    const { data: scouts, error: countError } = await supabase
      .from('scouts')
      .select('id')
      .eq('user_id', TEST_USER_ID);

    if (countError) {
      console.log(`[CLEANUP] Error counting scouts: ${countError.message}`);
    } else {
      console.log(`[CLEANUP] Found ${scouts?.length ?? 0} scout(s) for user ${TEST_USER_ID}`);
    }

    // Also count orphaned executions (if any)
    const { data: execs, error: execCountError } = await supabase
      .from('scout_executions')
      .select('id')
      .eq('user_id', TEST_USER_ID);

    if (!execCountError) {
      console.log(`[CLEANUP] Found ${execs?.length ?? 0} execution(s) for user ${TEST_USER_ID}`);
    }

    // Also count orphaned units (if any)
    const { data: units, error: unitCountError } = await supabase
      .from('information_units')
      .select('id')
      .eq('user_id', TEST_USER_ID);

    if (!unitCountError) {
      console.log(`[CLEANUP] Found ${units?.length ?? 0} unit(s) for user ${TEST_USER_ID}`);
    }

    // Delete scouts -- CASCADE will take care of executions and units
    const { error } = await supabase
      .from('scouts')
      .delete()
      .eq('user_id', TEST_USER_ID);

    if (error) {
      console.log(`[CLEANUP] Error deleting scouts: ${error.message}`);
    }
    assertEquals(error, null, `Cleanup should succeed: ${error?.message}`);

    // Also clean up any orphaned executions (e.g. if scout was already deleted but execution remains)
    const { error: execError } = await supabase
      .from('scout_executions')
      .delete()
      .eq('user_id', TEST_USER_ID);

    if (execError) {
      console.log(`[CLEANUP] Error deleting orphaned executions: ${execError.message}`);
    }

    // Also clean up any orphaned units
    const { error: unitError } = await supabase
      .from('information_units')
      .delete()
      .eq('user_id', TEST_USER_ID);

    if (unitError) {
      console.log(`[CLEANUP] Error deleting orphaned units: ${unitError.message}`);
    }

    console.log('[CLEANUP] Done. All test data for test-runner-integration removed.');
  },
});

// Also clean up the other-user used for isolation tests
Deno.test({
  name: 'cleanup: delete other-user-isolation-test data',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { createClient } = await import(
      'https://esm.sh/@supabase/supabase-js@2.39.3'
    );

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { error } = await supabase
      .from('scouts')
      .delete()
      .eq('user_id', 'other-user-isolation-test');

    if (error) {
      console.log(`[CLEANUP] Error deleting other-user scouts: ${error.message}`);
    } else {
      console.log('[CLEANUP] Cleaned up other-user-isolation-test data.');
    }
  },
});
