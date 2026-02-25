// Bajour Send Verification Edge Function
// Sends a draft to village correspondents via WhatsApp Business API for verification

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient, requireUserId } from '../_shared/supabase-client.ts';
import { VILLAGE_CORRESPONDENTS } from '../_shared/correspondents.ts';

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
    const correspondents = VILLAGE_CORRESPONDENTS[draft.village_id] || [];

    if (correspondents.length === 0) {
      return errorResponse(
        `Keine Korrespondenten für Gemeinde "${draft.village_id}" gefunden`,
        400,
        'VALIDATION_ERROR'
      );
    }

    // Send WhatsApp messages to each correspondent
    const allMessageIds: string[] = [];

    for (const correspondent of correspondents) {
      // Message 1: Full draft text
      const textResult = await sendWhatsAppMessage({
        to: correspondent.phone,
        type: 'text',
        text: { body: draft.body },
      });
      allMessageIds.push(textResult.message_id);

      // Message 2: Template with verification buttons
      const templateResult = await sendWhatsAppMessage({
        to: correspondent.phone,
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
    return errorResponse(message, 500);
  }
});
