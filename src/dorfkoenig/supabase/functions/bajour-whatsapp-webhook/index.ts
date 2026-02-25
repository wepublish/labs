// Bajour WhatsApp Webhook Edge Function
// Empfaengt Verifizierungsantworten von Dorfkorrespondenten via WhatsApp Business API

import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase-client.ts';

// Environment secrets
const WHATSAPP_APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET')!;
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN')!;

import { VILLAGE_CORRESPONDENTS } from '../_shared/correspondents.ts';

// --- HMAC-SHA256 Signaturpruefung ---

async function verifySignature(
  payload: string,
  signatureHeader: string
): Promise<boolean> {
  // Meta sendet: sha256=<hex>
  const expectedPrefix = 'sha256=';
  if (!signatureHeader.startsWith(expectedPrefix)) {
    return false;
  }
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

  // Timing-safe Vergleich
  if (computedHex.length !== receivedHex.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < computedHex.length; i++) {
    mismatch |= computedHex.charCodeAt(i) ^ receivedHex.charCodeAt(i);
  }
  return mismatch === 0;
}

// --- Verifizierungslogik ---

interface VerificationResponse {
  name: string;
  phone: string;
  response: 'bestätigt' | 'abgelehnt';
  responded_at: string;
}

function resolveVerificationStatus(
  responses: VerificationResponse[],
  totalCorrespondents: number
): 'ausstehend' | 'bestätigt' | 'abgelehnt' {
  const confirms = responses.filter((r) => r.response === 'bestätigt').length;
  const rejects = responses.filter((r) => r.response === 'abgelehnt').length;
  const majority = Math.floor(totalCorrespondents / 2) + 1;

  if (rejects >= majority) return 'abgelehnt';
  if (confirms >= majority) return 'bestätigt';

  // Alle haben geantwortet und Gleichstand → bestätigt
  if (responses.length === totalCorrespondents && confirms === rejects) {
    return 'bestätigt';
  }

  return 'ausstehend';
}

// --- Telefonnummer normalisieren (+ entfernen fuer Vergleich) ---

function normalizePhone(phone: string): string {
  return phone.replace(/^\+/, '');
}

function maskPhone(phone: string): string {
  if (phone.length <= 6) return '***';
  return phone.slice(0, 3) + '***' + phone.slice(-3);
}

// --- Korrespondenten fuer eine Telefonnummer finden ---

function findCorrespondentByPhone(
  phone: string
): { villageId: string; name: string; phone: string } | null {
  const normalizedIncoming = normalizePhone(phone);

  for (const [villageId, correspondents] of Object.entries(VILLAGE_CORRESPONDENTS)) {
    for (const c of correspondents) {
      if (normalizePhone(c.phone) === normalizedIncoming) {
        return { villageId, name: c.name, phone: c.phone };
      }
    }
  }
  return null;
}

// --- GET: Meta Webhook-Verifizierung ---

function handleWebhookVerification(req: Request): Response {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook-Verifizierung erfolgreich');
    return new Response(challenge || '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  console.error('Webhook-Verifizierung fehlgeschlagen: ungültiger Token');
  return new Response('Forbidden', { status: 403 });
}

// --- POST: Eingehende WhatsApp-Nachrichten verarbeiten ---

async function handleIncomingMessage(req: Request): Promise<Response> {
  const rawBody = await req.text();

  // Signatur pruefen
  const signatureHeader = req.headers.get('x-hub-signature-256') || '';
  const isValid = await verifySignature(rawBody, signatureHeader);

  if (!isValid) {
    console.error('Ungueltige Webhook-Signatur');
    // Trotzdem 200 zurueckgeben, um Retry-Schleifen zu vermeiden
    return jsonResponse({ status: 'invalid_signature' });
  }

  const body = JSON.parse(rawBody);

  // Nachricht aus dem Webhook-Payload extrahieren
  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const message = value?.messages?.[0];

  if (!message) {
    // Kein Nachrichteninhalt (z.B. Status-Update) — normal quittieren
    return jsonResponse({ status: 'no_message' });
  }

  // Nur interaktive Button-Antworten verarbeiten
  const buttonReply = message.interactive?.button_reply;
  if (!buttonReply) {
    console.log('Nachricht ignoriert (kein Button-Reply):', message.type);
    return jsonResponse({ status: 'ignored' });
  }

  const fromPhone = message.from; // z.B. "41783124547" (ohne +)
  const responseTitle = (buttonReply.title as string).toLowerCase(); // case-insensitive

  // Antwort validieren
  if (responseTitle !== 'bestätigt' && responseTitle !== 'abgelehnt') {
    console.error('Unbekannte Antwort:', responseTitle);
    return jsonResponse({ status: 'unknown_response' });
  }

  // Korrespondent anhand der Telefonnummer identifizieren
  const correspondent = findCorrespondentByPhone(fromPhone);
  if (!correspondent) {
    console.error('Unbekannte Telefonnummer:', maskPhone(fromPhone));
    return jsonResponse({ status: 'unknown_phone' });
  }

  const supabase = createServiceClient();

  // Offenen Entwurf finden, der auf Verifizierung wartet und zu einer
  // Gemeinde gehoert, fuer die dieser Korrespondent zustaendig ist
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

  // Den passenden Entwurf finden: village_id muss mit dem Korrespondenten uebereinstimmen
  const matchingDraft = (pendingDrafts || []).find((draft: Record<string, unknown>) => {
    const villageId = draft.village_id as string;
    const villageCorrespondents = VILLAGE_CORRESPONDENTS[villageId] || [];
    return villageCorrespondents.some(
      (c) => normalizePhone(c.phone) === normalizePhone(fromPhone)
    );
  });

  if (!matchingDraft) {
    console.error(
      'Kein offener Entwurf fuer Korrespondent gefunden:',
      correspondent.name,
      maskPhone(fromPhone)
    );
    return jsonResponse({ status: 'no_pending_draft' });
  }

  // Pruefen, ob dieser Korrespondent bereits geantwortet hat
  const existingResponses: VerificationResponse[] =
    (matchingDraft.verification_responses as VerificationResponse[]) || [];
  const alreadyResponded = existingResponses.some(
    (r) => normalizePhone(r.phone) === normalizePhone(fromPhone)
  );

  if (alreadyResponded) {
    console.log('Korrespondent hat bereits geantwortet:', correspondent.name);
    return jsonResponse({ status: 'already_responded' });
  }

  // Neue Antwort hinzufuegen
  const newResponse: VerificationResponse = {
    name: correspondent.name,
    phone: correspondent.phone,
    response: responseTitle,
    responded_at: new Date().toISOString(),
  };

  const updatedResponses = [...existingResponses, newResponse];

  // Verifizierungsstatus berechnen
  const villageCorrespondents =
    VILLAGE_CORRESPONDENTS[matchingDraft.village_id as string] || [];
  const newStatus = resolveVerificationStatus(updatedResponses, villageCorrespondents.length);

  // Update-Objekt erstellen
  const updateData: Record<string, unknown> = {
    verification_responses: updatedResponses,
    verification_status: newStatus,
  };

  // Falls aufgeloest, Zeitstempel setzen
  if (newStatus !== 'ausstehend') {
    updateData.verification_resolved_at = new Date().toISOString();
  }

  const { error: updateError } = await supabase
    .from('bajour_drafts')
    .update(updateData)
    .eq('id', matchingDraft.id);

  if (updateError) {
    console.error('Fehler beim Aktualisieren des Entwurfs:', updateError);
    return jsonResponse({ status: 'update_error' });
  }

  console.log(
    `Antwort von ${correspondent.name}: ${responseTitle} ` +
      `(Entwurf ${matchingDraft.id}, Status: ${newStatus})`
  );

  // Timeout-Aufloesung als Huckepack-Operation ausfuehren
  try {
    await supabase.rpc('resolve_bajour_timeouts');
  } catch (rpcError) {
    // Nicht-kritischer Fehler — nur loggen
    console.error('resolve_bajour_timeouts Fehler:', rpcError);
  }

  return jsonResponse({ status: 'processed' });
}

// --- Deno.serve Haupthandler ---

Deno.serve(async (req) => {
  // CORS behandeln
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
    // Meta erwartet immer 200 — bei POST-Fehlern trotzdem 200 zurueckgeben
    const message = err instanceof Error ? err.message : String(err);
    console.error('bajour-whatsapp-webhook Fehler:', message);
    if (req.method === 'POST') {
      return jsonResponse({ status: 'error', message });
    }
    return jsonResponse({ error: message }, 500);
  }
});
