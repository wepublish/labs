import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export interface LiveTestContext {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  testUserId: string;
  anonClient: SupabaseClient;
  serviceClient: SupabaseClient;
  scoutsUrl: string;
  civicDiscoverUrl: string;
  civicTestUrl: string;
}

export interface ScoutRunResult {
  executionId: string;
  startedAt: number;
}

export interface ExecutionSnapshot {
  id: string;
  scout_id: string;
  status: 'running' | 'completed' | 'failed';
  completed_at: string | null;
  units_extracted: number;
  merged_existing_count: number | null;
  error_message: string | null;
  summary_text: string | null;
}

const DEFAULT_TEST_USER_ID = 'smoke-live-scouts';

export function createLiveTestContext(): LiveTestContext {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const testUserId = Deno.env.get('SMOKE_TEST_USER_ID') ?? DEFAULT_TEST_USER_ID;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error('SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  return {
    supabaseUrl,
    anonKey,
    serviceRoleKey,
    testUserId,
    anonClient: createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
    serviceClient: createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
    scoutsUrl: `${supabaseUrl}/functions/v1/scouts`,
    civicDiscoverUrl: `${supabaseUrl}/functions/v1/civic-discover`,
    civicTestUrl: `${supabaseUrl}/functions/v1/civic-test`,
  };
}

export function anonHeaders(ctx: LiveTestContext): HeadersInit {
  return {
    Authorization: `Bearer ${ctx.anonKey}`,
    'Content-Type': 'application/json',
    'x-user-id': ctx.testUserId,
  };
}

export function serviceHeaders(ctx: LiveTestContext): HeadersInit {
  return {
    Authorization: `Bearer ${ctx.serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}

export function logStep(message: string): void {
  console.log(`\n[SMOKE] ${message}`);
}

export function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Expected JSON response but received: ${text.slice(0, 500)} (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

export async function createScout(
  ctx: LiveTestContext,
  payload: Record<string, unknown>,
): Promise<{ id: string; scout_type: string }> {
  const response = await fetch(ctx.scoutsUrl, {
    method: 'POST',
    headers: anonHeaders(ctx),
    body: JSON.stringify(payload),
  });
  const body = await parseJsonResponse(response) as { data?: { id?: string; scout_type?: string }; error?: string };

  if (response.status !== 201 || !body?.data?.id) {
    throw new Error(`Failed to create scout (${response.status}): ${JSON.stringify(body)}`);
  }

  return {
    id: body.data.id,
    scout_type: body.data.scout_type ?? String(payload.scout_type ?? 'web'),
  };
}

export async function runScout(ctx: LiveTestContext, scoutId: string): Promise<ScoutRunResult> {
  const response = await fetch(`${ctx.scoutsUrl}/${scoutId}/run`, {
    method: 'POST',
    headers: anonHeaders(ctx),
    body: JSON.stringify({
      skip_notification: true,
      extract_units: true,
    }),
  });
  const body = await parseJsonResponse(response) as { data?: { execution_id?: string } };

  if (response.status !== 202 || !body?.data?.execution_id) {
    throw new Error(`Failed to dispatch scout (${response.status}): ${JSON.stringify(body)}`);
  }

  return {
    executionId: body.data.execution_id,
    startedAt: Date.now(),
  };
}

export async function waitForExecution(
  ctx: LiveTestContext,
  executionId: string,
  timeoutMs = 240_000,
): Promise<ExecutionSnapshot> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { data, error } = await ctx.serviceClient
      .from('scout_executions')
      .select('id, scout_id, status, completed_at, units_extracted, merged_existing_count, error_message, summary_text')
      .eq('id', executionId)
      .single();

    if (error) {
      throw error;
    }

    const snapshot = data as ExecutionSnapshot;
    if (snapshot.status !== 'running') {
      return snapshot;
    }

    await delay(3_000);
  }

  throw new Error(`Timed out waiting for execution ${executionId} to complete`);
}

export async function assertNoRunningExecution(
  ctx: LiveTestContext,
  executionId: string,
): Promise<void> {
  const { data, error } = await ctx.serviceClient
    .from('scout_executions')
    .select('id')
    .eq('id', executionId)
    .eq('status', 'running');

  if (error) {
    throw error;
  }

  assertCondition((data ?? []).length === 0, `Execution ${executionId} is still marked running`);
}

export async function cleanupTestUser(ctx: LiveTestContext): Promise<void> {
  logStep(`Cleaning test data for user ${ctx.testUserId}`);

  const tables = [
    'promises',
    'unit_occurrences',
    'information_units',
    'scout_executions',
    'scouts',
  ] as const;

  for (const table of tables) {
    const { error } = await ctx.serviceClient
      .from(table)
      .delete()
      .eq('user_id', ctx.testUserId);

    if (error) {
      throw new Error(`Cleanup failed for ${table}: ${error.message}`);
    }
  }
}

export async function findValidatedCivicSource(
  ctx: LiveTestContext,
  rootDomains: string[],
): Promise<{ rootDomain: string; trackedUrls: string[]; documentsFound: number; samplePromises: number }> {
  for (const rootDomain of rootDomains) {
    logStep(`Discovering civic URLs on ${rootDomain}`);

    const discoverResponse = await fetch(ctx.civicDiscoverUrl, {
      method: 'POST',
      headers: anonHeaders(ctx),
      body: JSON.stringify({ root_domain: rootDomain }),
    });
    const discoverBody = await parseJsonResponse(discoverResponse) as {
      data?: Array<{ url: string }>;
      error?: string;
    };

    if (discoverResponse.status !== 200) {
      console.warn(`[SMOKE] civic-discover failed for ${rootDomain}: ${JSON.stringify(discoverBody)}`);
      continue;
    }

    const candidates = (discoverBody.data ?? []).map((item) => item.url).filter(Boolean);
    if (candidates.length === 0) {
      continue;
    }

    const attempts: string[][] = candidates.slice(0, 3).map((url) => [url]);
    if (candidates.length >= 2) {
      attempts.push(candidates.slice(0, 2));
    }

    for (const trackedUrls of attempts) {
      logStep(`Validating civic tracked URLs: ${trackedUrls.join(', ')}`);
      const testResponse = await fetch(ctx.civicTestUrl, {
        method: 'POST',
        headers: anonHeaders(ctx),
        body: JSON.stringify({ tracked_urls: trackedUrls }),
      });
      const testBody = await parseJsonResponse(testResponse) as {
        data?: {
          valid?: boolean;
          documents_found?: number;
          sample_promises?: unknown[];
        };
      };

      if (testResponse.status !== 200 || !testBody?.data?.valid) {
        continue;
      }

      const documentsFound = testBody.data.documents_found ?? 0;
      const samplePromises = Array.isArray(testBody.data.sample_promises)
        ? testBody.data.sample_promises.length
        : 0;

      if (documentsFound > 0 && samplePromises > 0) {
        return {
          rootDomain,
          trackedUrls,
          documentsFound,
          samplePromises,
        };
      }
    }
  }

  throw new Error(`Unable to discover a valid civic smoke-test source from domains: ${rootDomains.join(', ')}`);
}

export async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
