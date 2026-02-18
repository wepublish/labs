// Executions Edge Function - Scout execution history

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient, requireUserId } from '../_shared/supabase-client.ts';

Deno.serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const userId = requireUserId(req);
    const supabase = createServiceClient();
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);

    // Extract execution ID if present
    const executionId = pathParts.length > 2 ? pathParts[2] : null;

    if (req.method !== 'GET') {
      return errorResponse('Methode nicht erlaubt', 405);
    }

    if (executionId) {
      return await getExecution(supabase, userId, executionId);
    }

    return await listExecutions(supabase, userId, url);
  } catch (error) {
    console.error('Executions error:', error);
    if (error.message === 'Authentication required') {
      return errorResponse('Authentifizierung erforderlich', 401, 'UNAUTHORIZED');
    }
    return errorResponse(error.message, 500);
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
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
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
      summary_text,
      error_message,
      created_at,
      scouts!inner (
        name
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
  const executions = (data || []).map((e) => ({
    id: e.id,
    scout_id: e.scout_id,
    scout_name: (e.scouts as { name: string })?.name,
    status: e.status,
    started_at: e.started_at,
    completed_at: e.completed_at,
    change_status: e.change_status,
    criteria_matched: e.criteria_matched,
    is_duplicate: e.is_duplicate,
    notification_sent: e.notification_sent,
    units_extracted: e.units_extracted,
    summary_text: e.summary_text,
    error_message: e.error_message,
  }));

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
        url
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
  const { data: units } = await supabase
    .from('information_units')
    .select('id, statement, unit_type, entities, created_at')
    .eq('execution_id', executionId)
    .order('created_at', { ascending: true });

  return jsonResponse({
    data: {
      id: execution.id,
      scout_id: execution.scout_id,
      scout: execution.scouts,
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
      scrape_duration_ms: execution.scrape_duration_ms,
      summary_text: execution.summary_text,
      error_message: execution.error_message,
      units: units || [],
    },
  });
}
