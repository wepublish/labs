/**
 * @module civic-promises
 * CRUD for civic scout promises.
 * GET: list promises for a scout. PATCH /:id: update promise status.
 * Auth: x-user-id header.
 */

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient, requireUserId } from '../_shared/supabase-client.ts';

const VALID_STATUSES = ['new', 'in_progress', 'fulfilled', 'broken', 'notified'];

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const userId = requireUserId(req);
    const supabase = createServiceClient();
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);

    // pathParts: ['civic-promises', '{id}']
    const promiseId = pathParts.length > 1 ? pathParts[1] : null;

    switch (req.method) {
      case 'GET':
        return await listPromises(supabase, userId, url);

      case 'PATCH':
        if (!promiseId) {
          return errorResponse('Promise ID erforderlich', 400);
        }
        return await updatePromise(supabase, userId, promiseId, req);

      default:
        return errorResponse('Methode nicht erlaubt', 405);
    }
  } catch (error) {
    console.error('civic-promises error:', error);
    if (error.message === 'Authentication required') {
      return errorResponse('Authentifizierung erforderlich', 401, 'UNAUTHORIZED');
    }
    return errorResponse(error.message, 500);
  }
});

async function listPromises(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  url: URL,
) {
  const scoutId = url.searchParams.get('scout_id');

  let query = supabase
    .from('promises')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (scoutId) {
    query = query.eq('scout_id', scoutId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('List promises error:', error);
    return errorResponse('Fehler beim Laden der Versprechen', 500);
  }

  return jsonResponse({ data: data || [] });
}

async function updatePromise(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  promiseId: string,
  req: Request,
) {
  const body = await req.json();

  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    return errorResponse('Ungültiger Status', 400, 'VALIDATION_ERROR');
  }

  const updates: Record<string, unknown> = {};
  if (body.status !== undefined) updates.status = body.status;

  if (Object.keys(updates).length === 0) {
    return errorResponse('Keine Änderungen angegeben', 400);
  }

  const { data, error } = await supabase
    .from('promises')
    .update(updates)
    .eq('id', promiseId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return errorResponse('Versprechen nicht gefunden', 404);
    }
    console.error('Update promise error:', error);
    return errorResponse('Fehler beim Aktualisieren', 500);
  }

  return jsonResponse({ data });
}
