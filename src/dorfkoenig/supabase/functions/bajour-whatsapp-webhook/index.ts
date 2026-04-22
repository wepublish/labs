/**
 * @module bajour-whatsapp-webhook
 * Receives WhatsApp quick-reply callbacks from village correspondents.
 * POST: processes bestätigt/abgelehnt responses via the append_bajour_response RPC
 *       (race-safe, SELECT ... FOR UPDATE) and fires an admin alert email on every
 *       rejection that actually lands.
 * GET:  Meta webhook verification (hub.challenge handshake).
 */

import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase-client.ts';
import { findCorrespondentByPhone } from '../_shared/correspondents.ts';
import { resend } from '../_shared/resend.ts';
import { signAdminDraftLink, buildAdminDraftUrl } from '../_shared/admin-link.ts';
import { hmacHex, constantTimeEqual } from '../_shared/admin-link-core.ts';
import { sanitiseBulletForFeedback } from '../_shared/feedback-sanitise.ts';

const FLAG_FEEDBACK_CAPTURE = Deno.env.get('FEATURE_FEEDBACK_CAPTURE') === 'true';

// Environment secrets
const WHATSAPP_APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET')!;
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN')!;
const PUBLIC_APP_URL =
  Deno.env.get('PUBLIC_APP_URL') || 'https://wepublish.github.io/labs/dorfkoenig';
const DEFAULT_ADMIN_EMAILS = 'samuel.hufschmid@bajour.ch,ernst.field@bajour.ch';
const ADMIN_EMAILS: string[] = (Deno.env.get('ADMIN_EMAILS') || DEFAULT_ADMIN_EMAILS)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// --- HMAC-SHA256 Signaturpruefung ---

async function verifySignature(
  payload: string,
  signatureHeader: string
): Promise<boolean> {
  const expectedPrefix = 'sha256=';
  if (!signatureHeader.startsWith(expectedPrefix)) return false;
  const receivedHex = signatureHeader.slice(expectedPrefix.length);

  const computedHex = await hmacHex(WHATSAPP_APP_SECRET, payload);
  return constantTimeEqual(computedHex, receivedHex);
}

// Status resolution is authoritative in the `append_bajour_response` RPC.
// See supabase/migrations/20260416000006_bajour_any_reject_wins.sql
// and bajour/verification.ts for the client-side mirror used by unit tests.

interface VerificationResponse {
  name: string;
  phone: string;
  response: 'bestätigt' | 'abgelehnt';
  responded_at: string;
}

// Subset of bajour_drafts columns read by the webhook handler. The
// .select('*') call returns the full row, but we only consume these fields.
interface MatchingDraft {
  id: string;
  title: string | null;
  village_id: string;
  village_name: string;
  publication_date: string | null;
  schema_version: number | null;
  bullets_json: unknown | null;
  body: string | null;
  selected_unit_ids: string[] | null;
}

function maskPhone(phone: string): string {
  if (phone.length <= 6) return '***';
  return phone.slice(0, 3) + '***' + phone.slice(-3);
}

// --- GET: Meta Webhook-Verifizierung ---

function handleWebhookVerification(req: Request): Response {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge || '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  console.error('Webhook-Verifizierung fehlgeschlagen: ungültiger Token');
  return new Response('Forbidden', { status: 403 });
}

// --- Admin email on rejection ---

async function sendAdminRejectionEmail(params: {
  draftId: string;
  draftTitle: string;
  villageName: string;
  correspondentName: string;
  respondedAt: string;
  priorResponses: VerificationResponse[];
}): Promise<void> {
  if (ADMIN_EMAILS.length === 0) {
    console.warn('ADMIN_EMAILS is empty; skipping rejection notification');
    return;
  }
  try {
    const signed = await signAdminDraftLink(params.draftId);
    const draftUrl = buildAdminDraftUrl(PUBLIC_APP_URL, signed);

    const html = resend.buildDraftRejectionEmail({
      draftTitle: params.draftTitle,
      villageName: params.villageName,
      correspondentName: params.correspondentName,
      respondedAt: params.respondedAt,
      draftUrl,
      priorResponses: params.priorResponses.map((r) => ({
        name: r.name,
        response: r.response,
      })),
    });

    const result = await resend.sendEmail({
      to: ADMIN_EMAILS,
      subject: `Entwurf abgelehnt — ${params.villageName}: ${params.draftTitle || '(ohne Titel)'}`,
      html,
    });

    if (!result.success) {
      console.error('Admin-Benachrichtigung fehlgeschlagen:', result.error);
    }
  } catch (err) {
    // Never throw — the webhook must still acknowledge Meta with 200.
    const message = err instanceof Error ? err.message : String(err);
    console.error('Admin-Benachrichtigung Fehler:', message);
  }
}

// --- POST: Eingehende WhatsApp-Nachrichten verarbeiten ---

async function handleIncomingMessage(req: Request): Promise<Response> {
  const rawBody = await req.text();

  const signatureHeader = req.headers.get('x-hub-signature-256') || '';
  const isValid = await verifySignature(rawBody, signatureHeader);
  if (!isValid) {
    console.error('Ungueltige Webhook-Signatur');
    return jsonResponse({ status: 'invalid_signature' });
  }

  const body = JSON.parse(rawBody);

  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;

  // Delivery status events (sent/delivered/read/failed). Persist for forensics
  // and return early — these payloads carry no `messages[]`.
  const statuses = value?.statuses;
  if (Array.isArray(statuses) && statuses.length > 0) {
    try {
      const supabase = createServiceClient();
      await supabase.from('bajour_whatsapp_status_events').insert(
        statuses.map((s: { id: string; status: string; recipient_id?: string; errors?: Array<{ code: number; title: string; error_data?: { details?: string } }> }) => ({
          wamid: s.id,
          status: s.status,
          recipient: s.recipient_id ?? '',
          error_code: s.errors?.[0]?.code ?? null,
          error_title: s.errors?.[0]?.title ?? null,
          error_detail: s.errors?.[0]?.error_data?.details ?? null,
          raw: s,
        }))
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('bajour_whatsapp_status_events insert failed:', msg);
    }
    return jsonResponse({ status: 'status_recorded', count: statuses.length });
  }

  const message = value?.messages?.[0];

  if (!message) {
    return jsonResponse({ status: 'no_message' });
  }

  let responseText: string | null = null;
  if (message.type === 'button' && message.button?.text) {
    responseText = message.button.text;
  } else if (message.interactive?.button_reply?.title) {
    responseText = message.interactive.button_reply.title;
  }

  if (!responseText) {
    return jsonResponse({ status: 'ignored' });
  }

  const fromPhone = message.from; // e.g. "41783124547"
  const responseTitle = responseText.toLowerCase();

  if (responseTitle !== 'bestätigt' && responseTitle !== 'abgelehnt') {
    console.error('Unbekannte Antwort:', responseTitle);
    return jsonResponse({ status: 'unknown_response' });
  }

  const correspondent = await findCorrespondentByPhone(fromPhone);
  if (!correspondent) {
    console.error('Unbekannte Telefonnummer:', maskPhone(fromPhone));
    return jsonResponse({ status: 'unknown_phone' });
  }

  const supabase = createServiceClient();
  const contextMessageId = message.context?.id;

  let matchingDraft: MatchingDraft | null = null;

  if (contextMessageId) {
    const { data, error } = await supabase
      .from('bajour_drafts')
      .select('id, title, village_id, village_name, publication_date, schema_version, bullets_json, body, selected_unit_ids')
      .contains('whatsapp_message_ids', JSON.stringify([contextMessageId]))
      .eq('verification_status', 'ausstehend')
      .not('verification_sent_at', 'is', null)
      .maybeSingle<MatchingDraft>();

    if (error) {
      console.error('Fehler bei Message-ID-Suche:', error);
    } else {
      matchingDraft = data;
    }

    if (matchingDraft) {
      console.log('Entwurf via Message-ID gefunden:', contextMessageId);
    }
  }

  if (!matchingDraft) {
    if (contextMessageId) {
      console.warn('Message-ID-Match fehlgeschlagen, Fallback auf Gemeinde:', contextMessageId);
    }

    const { data: pendingDrafts, error: fetchError } = await supabase
      .from('bajour_drafts')
      .select('id, title, village_id, village_name, publication_date, schema_version, bullets_json, body, selected_unit_ids')
      .eq('verification_status', 'ausstehend')
      .not('verification_sent_at', 'is', null)
      .is('verification_resolved_at', null)
      .order('verification_sent_at', { ascending: false })
      .returns<MatchingDraft[]>();

    if (fetchError) {
      console.error('Fehler beim Laden der Entwuerfe:', fetchError);
      return jsonResponse({ status: 'db_error' });
    }

    matchingDraft = (pendingDrafts || []).find(
      (draft) => draft.village_id === correspondent.villageId
    ) || null;
  }

  if (!matchingDraft) {
    console.error(
      'Kein offener Entwurf fuer Korrespondent gefunden:',
      correspondent.name,
      maskPhone(fromPhone)
    );
    return jsonResponse({ status: 'no_pending_draft' });
  }

  const newResponse: VerificationResponse = {
    name: correspondent.name,
    phone: correspondent.phone,
    response: responseTitle,
    responded_at: new Date().toISOString(),
  };

  // Atomic append + status resolution. Prevents clobber when two webhooks race.
  const { data: rpcRows, error: rpcError } = await supabase.rpc('append_bajour_response', {
    p_draft_id: matchingDraft.id,
    p_response: newResponse,
  });

  if (rpcError) {
    console.error('append_bajour_response Fehler:', rpcError);
    return jsonResponse({ status: 'update_error' });
  }

  const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
  if (!row) {
    console.error('append_bajour_response: leere Antwort');
    return jsonResponse({ status: 'update_error' });
  }

  const alreadyResponded: boolean = !!row.already_responded;
  const newStatus: string = row.new_status;
  const updatedResponses: VerificationResponse[] = (row.verification_responses ?? []) as VerificationResponse[];

  if (alreadyResponded) {
    return jsonResponse({ status: 'already_responded' });
  }

  // Fire admin email on every fresh rejection (await — don't rely on waitUntil).
  if (newResponse.response === 'abgelehnt') {
    const priorResponses = updatedResponses.filter(
      (r) =>
        !(r.phone && newResponse.phone && r.phone.replace(/^\+/, '') === newResponse.phone.replace(/^\+/, ''))
    );
    await sendAdminRejectionEmail({
      draftId: matchingDraft.id,
      draftTitle: matchingDraft.title || '',
      villageName: matchingDraft.village_name || '',
      correspondentName: correspondent.name,
      respondedAt: newResponse.responded_at,
      priorResponses,
    });

    // §3.7 capture-only feedback harvest. Data sits dormant; retrieval is deferred
    // to specs/followups/self-learning-system.md. Sanitisation runs NOW so the
    // backlog is clean when activation happens.
    if (FLAG_FEEDBACK_CAPTURE) {
      try {
        await captureRejectionAsFeedback({
          supabase,
          draft: matchingDraft,
          editorReason: newResponse.response,
        });
      } catch (captureErr) {
        console.error('[whatsapp-webhook] feedback capture failed (non-fatal):', captureErr);
      }
    }
  }

  // Best-effort cleanup of stale ausstehend drafts (non-critical).
  if (newStatus !== 'ausstehend') {
    try {
      await supabase.rpc('resolve_bajour_timeouts');
    } catch (rpcErr) {
      console.error('resolve_bajour_timeouts Fehler:', rpcErr);
    }
  }

  return jsonResponse({ status: 'processed', verification_status: newStatus });
}

/**
 * §3.7 — harvest rejected bullets from bullets_json into bajour_feedback_examples.
 * Skips (with a logged counter) when the draft is v1 markdown only.
 * Idempotent on draft_id: re-firing on the same draft is a no-op.
 */
async function captureRejectionAsFeedback(args: {
  supabase: ReturnType<typeof createServiceClient>;
  draft: {
    id: string;
    village_id: string | null;
    publication_date: string | null;
    schema_version: number | null;
    bullets_json: unknown | null;
    body: string | null;
    selected_unit_ids?: string[] | null;
  };
  editorReason: string;
}): Promise<void> {
  const { supabase, draft, editorReason } = args;

  if (draft.schema_version !== 2 || !draft.bullets_json) {
    console.log(`[feedback-capture] capture_skipped_legacy_schema draft=${draft.id}`);
    return;
  }

  const { data: existing } = await supabase
    .from('bajour_feedback_examples')
    .select('id')
    .eq('draft_id', draft.id)
    .limit(1)
    .maybeSingle();
  if (existing) {
    console.log(`[feedback-capture] already_captured draft=${draft.id}`);
    return;
  }

  const { data: unitRows } = await supabase
    .from('information_units')
    .select('source_url, article_url')
    .in('id', (draft.selected_unit_ids ?? []) as string[]);
  const allowedUrls = (unitRows ?? []).flatMap((u: { source_url?: string | null; article_url?: string | null }) =>
    [u.source_url, u.article_url].filter((x): x is string => typeof x === 'string' && x.length > 0),
  );

  const bullets = Array.isArray(
    (draft.bullets_json as { bullets?: unknown[] }).bullets,
  )
    ? ((draft.bullets_json as { bullets: Array<{ text?: string; article_url?: string | null; source_unit_ids?: string[] }> }).bullets)
    : [];

  const rows: Array<{
    draft_id: string;
    village_id: string;
    kind: 'negative';
    bullet_text: string;
    editor_reason: string | null;
    source_unit_ids: string[];
    edition_date: string | null;
  }> = [];

  for (const b of bullets) {
    const result = sanitiseBulletForFeedback({
      bullet_text: b.text ?? '',
      article_url: b.article_url ?? null,
      allowed_urls: allowedUrls,
    });
    if (!result.ok) {
      console.log(`[feedback-capture] rejected bullet: ${result.reason}`);
      continue;
    }
    rows.push({
      draft_id: draft.id,
      village_id: draft.village_id ?? '',
      kind: 'negative',
      bullet_text: result.text,
      editor_reason: editorReason,
      source_unit_ids: b.source_unit_ids ?? [],
      edition_date: draft.publication_date,
    });
  }

  if (rows.length === 0) {
    console.log(`[feedback-capture] no_bullets_after_sanitisation draft=${draft.id}`);
    return;
  }

  const { error: insertErr } = await supabase.from('bajour_feedback_examples').insert(rows);
  if (insertErr) {
    console.error(`[feedback-capture] insert failed draft=${draft.id}:`, insertErr);
    return;
  }
  console.log(`[feedback-capture] captured ${rows.length} bullets from draft=${draft.id}`);
}

// --- Deno.serve Haupthandler ---

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    if (req.method === 'GET') {
      return handleWebhookVerification(req);
    }

    if (req.method === 'POST') {
      return await handleIncomingMessage(req);
    }

    return jsonResponse({ error: 'Methode nicht erlaubt' }, 405);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('bajour-whatsapp-webhook Fehler:', message);
    if (req.method === 'POST') {
      return jsonResponse({ status: 'error', message });
    }
    return jsonResponse({ error: message }, 500);
  }
});
