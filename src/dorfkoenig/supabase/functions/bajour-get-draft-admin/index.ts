/**
 * @module bajour-get-draft-admin
 * Service-role read of a single bajour_draft, authorized by an HMAC-signed URL issued
 * when the admin mailbox received a rejection alert. Bypasses the per-user RLS on
 * bajour_drafts so any admin reading the email can open the draft.
 *
 * GET /bajour-get-draft-admin?id=<uuid>&sig=<hex>&exp=<unix-seconds>
 */

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase-client.ts';
import { verifyAdminDraftLink } from '../_shared/admin-link.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'GET') {
    return errorResponse('Methode nicht erlaubt', 405);
  }

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const sig = url.searchParams.get('sig');
  const expRaw = url.searchParams.get('exp');

  if (!id || !sig || !expRaw) {
    return errorResponse('id, sig und exp sind erforderlich', 400);
  }

  const exp = Number.parseInt(expRaw, 10);
  if (!Number.isFinite(exp)) {
    return errorResponse('exp muss eine Ganzzahl sein', 400);
  }

  const check = await verifyAdminDraftLink(id, exp, sig);
  if (!check.valid) {
    const status = check.reason === 'expired' ? 410 : 403;
    return errorResponse(
      check.reason === 'expired' ? 'Link ist abgelaufen' : 'Signatur ungültig',
      status
    );
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('bajour_drafts')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('bajour-get-draft-admin DB Fehler:', error);
      return errorResponse('Datenbankfehler', 500);
    }

    if (!data) {
      return errorResponse('Entwurf nicht gefunden', 404);
    }

    if (!data.selection_diagnostics) {
      data.selection_diagnostics = await loadRunSelectionDiagnostics(supabase, data.id, data.selected_unit_ids ?? []);
    }

    return jsonResponse({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('bajour-get-draft-admin Fehler:', message);
    return errorResponse(message, 500);
  }
});

async function loadRunSelectionDiagnostics(
  supabase: ReturnType<typeof createServiceClient>,
  draftId: string,
  draftSelectedIds: string[],
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('auto_draft_runs')
    .select('candidate_snapshot, selected_unit_ids, mandatory_kept_ids, rejected_top_units, selection_response_preview')
    .eq('draft_id', draftId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;

  const candidateSnapshot = Array.isArray(data.candidate_snapshot) ? data.candidate_snapshot : [];
  const selectedUnitIds = Array.isArray(data.selected_unit_ids)
    ? data.selected_unit_ids.filter((id) => typeof id === 'string')
    : draftSelectedIds;
  const selected = new Set(selectedUnitIds);

  return {
    candidate_snapshot: candidateSnapshot,
    selected_unit_ids: selectedUnitIds,
    selected_units: candidateSnapshot.filter((row) =>
      typeof row === 'object' && row !== null && selected.has(String((row as { id?: unknown }).id))
    ),
    mandatory_kept_ids: Array.isArray(data.mandatory_kept_ids) ? data.mandatory_kept_ids : [],
    rejected_top_units: Array.isArray(data.rejected_top_units)
      ? data.rejected_top_units
      : candidateSnapshot
          .filter((row) => typeof row === 'object' && row !== null && !selected.has(String((row as { id?: unknown }).id)))
          .slice(0, 10),
    selection_response_preview: typeof data.selection_response_preview === 'string'
      ? data.selection_response_preview
      : null,
  };
}
