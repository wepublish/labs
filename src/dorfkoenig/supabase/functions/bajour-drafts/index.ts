// Bajour Drafts Edge Function — CRUD for bajour_drafts table

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

    // pathParts: ['bajour-drafts'] or ['bajour-drafts', '{id}']
    const draftId = pathParts.length > 1 ? pathParts[1] : null;

    switch (req.method) {
      case 'GET':
        return await listDrafts(supabase, userId);

      case 'POST':
        return await createDraft(supabase, userId, req);

      case 'PATCH':
        if (!draftId) {
          return errorResponse('Draft-ID erforderlich', 400);
        }
        return await updateDraft(supabase, userId, draftId, req);

      default:
        return errorResponse('Methode nicht erlaubt', 405);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('bajour-drafts error:', message);
    if (message === 'Authentication required') {
      return errorResponse('Authentifizierung erforderlich', 401, 'UNAUTHORIZED');
    }
    return errorResponse(message, 500);
  }
});

// List all drafts for the authenticated user
async function listDrafts(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string
) {
  const { data, error } = await supabase
    .from('bajour_drafts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('List drafts error:', error);
    return errorResponse('Fehler beim Laden der Entwürfe', 500);
  }

  return jsonResponse({ data: data || [] });
}

// Create a new draft
async function createDraft(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  req: Request
) {
  const body = await req.json();

  // Validate required fields
  if (!body.village_id?.trim()) {
    return errorResponse('village_id erforderlich', 400, 'VALIDATION_ERROR');
  }
  if (!body.village_name?.trim()) {
    return errorResponse('village_name erforderlich', 400, 'VALIDATION_ERROR');
  }
  if (!body.body?.trim()) {
    return errorResponse('body erforderlich', 400, 'VALIDATION_ERROR');
  }
  if (!Array.isArray(body.selected_unit_ids)) {
    return errorResponse('selected_unit_ids muss ein Array sein', 400, 'VALIDATION_ERROR');
  }

  const { data, error } = await supabase
    .from('bajour_drafts')
    .insert({
      user_id: userId,
      village_id: body.village_id.trim(),
      village_name: body.village_name.trim(),
      title: body.title?.trim() || null,
      body: body.body.trim(),
      selected_unit_ids: body.selected_unit_ids,
      custom_system_prompt: body.custom_system_prompt?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Create draft error:', error);
    return errorResponse('Fehler beim Erstellen des Entwurfs', 500);
  }

  return jsonResponse({ data }, 201);
}

// Update an existing draft (only own drafts)
async function updateDraft(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  draftId: string,
  req: Request
) {
  const body = await req.json();

  // Build update object with only provided fields
  const updates: Record<string, unknown> = {};

  if (body.title !== undefined) updates.title = body.title?.trim() || null;
  if (body.body !== undefined) updates.body = body.body.trim();
  if (body.village_id !== undefined) updates.village_id = body.village_id.trim();
  if (body.village_name !== undefined) updates.village_name = body.village_name.trim();
  if (body.selected_unit_ids !== undefined) updates.selected_unit_ids = body.selected_unit_ids;
  if (body.custom_system_prompt !== undefined) {
    updates.custom_system_prompt = body.custom_system_prompt?.trim() || null;
  }
  // Allow manual verification status override
  if (body.verification_status !== undefined) {
    const allowed = ['ausstehend', 'bestätigt', 'abgelehnt'];
    if (allowed.includes(body.verification_status)) {
      updates.verification_status = body.verification_status;
      if (body.verification_status !== 'ausstehend') {
        updates.verification_resolved_at = new Date().toISOString();
      }
    }
  }
  // verification_responses, verification_sent_at,
  // verification_timeout_at, whatsapp_message_ids
  // are NOT user-editable — only writable by service role (webhook + send-verification)

  if (Object.keys(updates).length === 0) {
    return errorResponse('Keine Änderungen angegeben', 400, 'VALIDATION_ERROR');
  }

  const { data, error } = await supabase
    .from('bajour_drafts')
    .update(updates)
    .eq('id', draftId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return errorResponse('Entwurf nicht gefunden', 404);
    }
    console.error('Update draft error:', error);
    return errorResponse('Fehler beim Aktualisieren des Entwurfs', 500);
  }

  return jsonResponse({ data });
}
