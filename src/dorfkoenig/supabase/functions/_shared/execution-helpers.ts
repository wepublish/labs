/**
 * @module execution-helpers
 * Shared execution lifecycle helpers used by both execute-scout and execute-civic-scout.
 */

import { createServiceClient } from './supabase-client.ts';

/**
 * Mark an execution as failed and increment the scout's consecutive_failures counter.
 */
export async function updateExecutionFailed(
  supabase: ReturnType<typeof createServiceClient>,
  executionId: string,
  scout: { id: string; consecutive_failures: number },
  errorMessage: string,
): Promise<void> {
  await supabase
    .from('scout_executions')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      change_status: 'error',
      error_message: errorMessage,
    })
    .eq('id', executionId);

  await supabase
    .from('scouts')
    .update({
      consecutive_failures: scout.consecutive_failures + 1,
    })
    .eq('id', scout.id);
}
