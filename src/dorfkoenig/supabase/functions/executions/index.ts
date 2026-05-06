/**
 * @module executions
 * Scout execution history (read-only).
 * GET: list executions with pagination (default 20), optional scout_id filter.
 * GET /:id: get single execution detail.
 */

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient, requireUserId } from '../_shared/supabase-client.ts';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../_shared/constants.ts';

interface ScoutJoin {
  id?: string;
  name: string;
  url?: string | null;
  criteria: string | null;
}

interface UnitJoin {
  id: string;
  statement: string;
  unit_type: string;
  entities: string[];
  created_at: string;
}

function readScoutJoin(value: unknown): ScoutJoin | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  if (typeof record.name !== 'string') return null;
  return {
    id: typeof record.id === 'string' ? record.id : undefined,
    name: record.name,
    url: typeof record.url === 'string' ? record.url : null,
    criteria: typeof record.criteria === 'string' ? record.criteria : null,
  };
}

function readUnitJoin(value: unknown): UnitJoin[] {
  const rows = Array.isArray(value) ? value : [value];
  return rows.filter((row): row is UnitJoin => {
    if (!row || typeof row !== 'object') return false;
    return typeof (row as { id?: unknown }).id === 'string';
  });
}

Deno.serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const userId = requireUserId(req);
    const supabase = createServiceClient();
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);

    // Supabase strips /functions/v1/ prefix — function sees /executions/{id}
    // pathParts: ['executions', '{id}']
    const executionId = pathParts.length > 1 ? pathParts[1] : null;

    if (req.method !== 'GET') {
      return errorResponse('Methode nicht erlaubt', 405);
    }

    if (executionId) {
      return await getExecution(supabase, userId, executionId);
    }

    return await listExecutions(supabase, userId, url);
  } catch (error) {
    console.error('Executions error:', error);
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'Authentication required') {
      return errorResponse('Authentifizierung erforderlich', 401, 'UNAUTHORIZED');
    }
    return errorResponse(message, 500);
  }
});

// List executions with filtering
async function listExecutions(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  url: URL
) {
  const scoutId = url.searchParams.get('scout_id');
  const status = url.searchParams.get('status');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || String(DEFAULT_PAGE_SIZE)), MAX_PAGE_SIZE);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  // Build query with scout join for name
  let query = supabase
    .from('scout_executions')
    .select(
      `
      id,
      scout_id,
      status,
      started_at,
      completed_at,
      change_status,
      criteria_matched,
      is_duplicate,
      notification_sent,
      units_extracted,
      merged_existing_count,
      summary_text,
      error_message,
      created_at,
      scouts!inner (
        name,
        criteria
      )
    `,
      { count: 'exact' }
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (scoutId) {
    query = query.eq('scout_id', scoutId);
  }

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('List executions error:', error);
    return errorResponse('Fehler beim Laden der Ausführungen', 500);
  }

  // Flatten the scout name
  const executions = (data || []).map((e) => {
    const scout = readScoutJoin(e.scouts);
    return {
      id: e.id,
      scout_id: e.scout_id,
      scout_name: scout?.name,
      scout_criteria: scout?.criteria ?? null,
      status: e.status,
      started_at: e.started_at,
      completed_at: e.completed_at,
      change_status: e.change_status,
      criteria_matched: e.criteria_matched,
      is_duplicate: e.is_duplicate,
      notification_sent: e.notification_sent,
      units_extracted: e.units_extracted,
      merged_existing_count: e.merged_existing_count,
      summary_text: e.summary_text,
      error_message: e.error_message,
    };
  });

  return jsonResponse({
    data: executions,
    meta: {
      total: count || 0,
      limit,
      offset,
    },
  });
}

// Get single execution with details
async function getExecution(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  executionId: string
) {
  // Fetch execution with scout info
  const { data: execution, error: execError } = await supabase
    .from('scout_executions')
    .select(
      `
      *,
      scouts (
        id,
        name,
        url,
        criteria
      )
    `
    )
    .eq('id', executionId)
    .eq('user_id', userId)
    .single();

  if (execError) {
    if (execError.code === 'PGRST116') {
      return errorResponse('Ausführung nicht gefunden', 404);
    }
    console.error('Get execution error:', execError);
    return errorResponse('Fehler beim Laden der Ausführung', 500);
  }

  // Fetch units extracted in this execution
  const { data: occurrences } = await supabase
    .from('unit_occurrences')
    .select(`
      extracted_at,
      information_units!inner (
        id,
        statement,
        unit_type,
        entities,
        created_at
      )
    `)
    .eq('execution_id', executionId)
    .order('extracted_at', { ascending: true });

  const scout = readScoutJoin(execution.scouts);
  const units = [...new Map(
    ((occurrences || []) as Array<{ information_units: unknown }>)
      .flatMap((occurrence) => readUnitJoin(occurrence.information_units))
      .map((unit) => [unit.id, unit] as const),
  ).values()];

  return jsonResponse({
    data: {
      id: execution.id,
      scout_id: execution.scout_id,
      scout,
      scout_criteria: scout?.criteria ?? null,
      status: execution.status,
      started_at: execution.started_at,
      completed_at: execution.completed_at,
      change_status: execution.change_status,
      criteria_matched: execution.criteria_matched,
      is_duplicate: execution.is_duplicate,
      duplicate_similarity: execution.duplicate_similarity,
      notification_sent: execution.notification_sent,
      notification_error: execution.notification_error,
      units_extracted: execution.units_extracted,
      merged_existing_count: execution.merged_existing_count ?? 0,
      scrape_duration_ms: execution.scrape_duration_ms,
      summary_text: execution.summary_text,
      error_message: execution.error_message,
      units,
    },
  });
}
