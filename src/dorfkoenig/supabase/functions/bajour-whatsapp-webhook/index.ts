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

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(WHATSAPP_APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const computedHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (computedHex.length !== receivedHex.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computedHex.length; i++) {
    mismatch |= computedHex.charCodeAt(i) ^ receivedHex.charCodeAt(i);
  }
  return mismatch === 0;
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

  let matchingDraft: Record<string, unknown> | null = null;

  if (contextMessageId) {
    const { data, error } = await supabase
      .from('bajour_drafts')
      .select('*')
      .contains('whatsapp_message_ids', JSON.stringify([contextMessageId]))
      .eq('verification_status', 'ausstehend')
      .not('verification_sent_at', 'is', null)
      .maybeSingle();

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
      .select('*')
      .eq('verification_status', 'ausstehend')
      .not('verification_sent_at', 'is', null)
      .is('verification_resolved_at', null)
      .order('verification_sent_at', { ascending: false });

    if (fetchError) {
      console.error('Fehler beim Laden der Entwuerfe:', fetchError);
      return jsonResponse({ status: 'db_error' });
    }

    matchingDraft = (pendingDrafts || []).find(
      (draft: Record<string, unknown>) => draft.village_id === correspondent.villageId
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
      draftId: matchingDraft.id as string,
      draftTitle: (matchingDraft.title as string) || '',
      villageName: (matchingDraft.village_name as string) || '',
      correspondentName: correspondent.name,
      respondedAt: newResponse.responded_at,
      priorResponses,
    });
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
