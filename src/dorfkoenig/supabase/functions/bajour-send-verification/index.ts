/**
 * @module bajour-send-verification
 * Sends a draft to village correspondents via WhatsApp Business API for verification.
 * POST: sends quick-reply messages (bestaetigt/abgelehnt) and sets timeout window.
 */

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient, requireUserId } from '../_shared/supabase-client.ts';
import { getCorrespondentsForVillage } from '../_shared/correspondents.ts';

// WhatsApp Business API credentials
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')!;
const WHATSAPP_API_TOKEN = Deno.env.get('WHATSAPP_API_TOKEN')!;

// --- WhatsApp API helper ---

async function sendWhatsAppMessage(
  payload: Record<string, unknown>
): Promise<{ message_id: string }> {
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WhatsApp API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return { message_id: data.messages?.[0]?.id || 'unknown' };
}

// --- Main handler ---

Deno.serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const userId = requireUserId(req);
    const supabase = createServiceClient();

    if (req.method !== 'POST') {
      return errorResponse('Methode nicht erlaubt', 405);
    }

    const { draft_id } = await req.json();

    if (!draft_id) {
      return errorResponse('draft_id erforderlich', 400, 'VALIDATION_ERROR');
    }

    // Fetch the draft (must belong to the authenticated user)
    const { data: draft, error: draftError } = await supabase
      .from('bajour_drafts')
      .select('*')
      .eq('id', draft_id)
      .eq('user_id', userId)
      .single();

    if (draftError) {
      if (draftError.code === 'PGRST116') {
        return errorResponse('Entwurf nicht gefunden', 404);
      }
      console.error('Fetch draft error:', draftError);
      return errorResponse('Fehler beim Laden des Entwurfs', 500);
    }

    // Look up correspondents for the draft's village
    const correspondents = await getCorrespondentsForVillage(draft.village_id);

    if (correspondents.length === 0) {
      return errorResponse(
        `Keine Korrespondenten für Gemeinde "${draft.village_id}" gefunden`,
        400,
        'VALIDATION_ERROR'
      );
    }

    // Send WhatsApp messages to each correspondent.
    // Template is sent first to ensure atomicity: if the template is not
    // approved or fails, no text message is sent either. This prevents
    // correspondents from receiving draft text without verification buttons.
    const allMessageIds: string[] = [];

    for (const correspondent of correspondents) {
      // Message 1: Template with verification buttons (sent first — fails
      // early if template not approved, before any text is delivered)
      const phoneWithPlus = '+' + correspondent.phone;

      const templateResult = await sendWhatsAppMessage({
        to: phoneWithPlus,
        type: 'template',
        template: {
          name: 'bajour_draft_verification',
          language: { code: 'de' },
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: draft.village_name }],
            },
          ],
        },
      });
      allMessageIds.push(templateResult.message_id);

      // Message 2: Full draft text (only sent if template succeeded)
      const textResult = await sendWhatsAppMessage({
        to: phoneWithPlus,
        type: 'text',
        text: { body: draft.body },
      });
      allMessageIds.push(textResult.message_id);
    }

    // Update the draft with verification metadata
    const now = new Date();
    const timeoutAt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours

    const { error: updateError } = await supabase
      .from('bajour_drafts')
      .update({
        verification_sent_at: now.toISOString(),
        verification_timeout_at: timeoutAt.toISOString(),
        whatsapp_message_ids: allMessageIds,
      })
      .eq('id', draft_id)
      .eq('user_id', userId);

    if (updateError) {
      console.error('Update draft error:', updateError);
      return errorResponse('Fehler beim Aktualisieren des Entwurfs', 500);
    }

    return jsonResponse({
      data: { sent_count: correspondents.length },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('bajour-send-verification error:', message);
    if (message === 'Authentication required') {
      return errorResponse('Authentifizierung erforderlich', 401, 'UNAUTHORIZED');
    }

    // Translate known WhatsApp API errors to user-friendly German messages
    if (message.includes('132001') || message.includes('does not exist in the translation')) {
      return errorResponse(
        'Die WhatsApp-Nachrichtenvorlage wurde noch nicht genehmigt. Bitte warten Sie auf die Freigabe durch Meta.',
        400,
        'TEMPLATE_NOT_APPROVED'
      );
    }
    if (message.includes('133010') || message.includes('Account not registered')) {
      return errorResponse(
        'Die WhatsApp-Telefonnummer ist nicht registriert. Bitte kontaktieren Sie den Administrator.',
        400,
        'PHONE_NOT_REGISTERED'
      );
    }
    if (message.includes('131047') || message.includes('Re-engagement message')) {
      return errorResponse(
        'Die Nachricht konnte nicht zugestellt werden. Der Empfänger muss zuerst eine Nachricht an diese Nummer senden.',
        400,
        'REENGAGEMENT_REQUIRED'
      );
    }

    return errorResponse(message, 500);
  }
});
