// Village correspondents — loaded from bajour_correspondents DB table.
// Phones stored WITHOUT '+' prefix (matches Meta webhook format).
// Falls back to BAJOUR_CORRESPONDENTS env secret with a logged warning.

import { createServiceClient } from './supabase-client.ts';
import { signAdminDraftLink, buildAdminDraftUrl } from './admin-link.ts';

export interface Correspondent {
  name: string;
  phone: string; // without '+' prefix
}

// Meta's body component cap is 1024 characters (template text + expanded
// params). For bajour_draft_verification_v2 the fixed frame is:
//   "Entwurf für {{1}} ({{2}}):\n\n{{3}}\n\nBitte bestätigen oder ablehnen."
// With {{1}}/{{2}} at reasonable lengths, the frame rounds to ~70 chars, so
// {{3}} max ≈ 954. We set 800 to leave generous headroom for unicode accounting
// differences between Meta and V8 (.length in UTF-16 code units).
// https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes#error-132005
export const TEMPLATE_PARAM_BODY_MAX = 800;

// Meta error 132018: template text params cannot contain newlines, tabs, or
// more than 4 consecutive spaces. Flatten paragraph breaks to a visible
// separator so WhatsApp still shows structure.
function flattenForTemplate(s: string): string {
  return s
    .replace(/\t/g, ' ')
    .replace(/\r?\n+/g, ' · ')
    .replace(/ {5,}/g, '    ');
}

export async function truncateForTemplateParam(
  body: string,
  publicAppUrl: string,
  draftId: string
): Promise<string> {
  const flat = flattenForTemplate(body);
  let result: string;
  if (flat.length <= TEMPLATE_PARAM_BODY_MAX) {
    result = flat;
  } else {
    const signed = await signAdminDraftLink(draftId);
    const link = buildAdminDraftUrl(publicAppUrl, signed);
    const reserve = ` · … vollständiger Entwurf: ${link}`;
    const budget = TEMPLATE_PARAM_BODY_MAX - reserve.length;
    result = flat.slice(0, budget).replace(/\s+\S*$/, '') + reserve;
  }
  console.log(
    `truncateForTemplateParam: body.len=${body.length} flat.len=${flat.length} result.len=${result.length}`
  );
  return result;
}

// --- WhatsApp Business API send helper ---
// Used by bajour-send-verification and bajour-auto-draft to notify correspondents.

const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')!;
const WHATSAPP_API_TOKEN = Deno.env.get('WHATSAPP_API_TOKEN')!;

// WhatsApp Business API message payloads we actually send. The full API supports
// more shapes (media, location, contacts, interactive replies); extend as needed.
export type WhatsAppMessagePayload =
  | {
      to: string;
      type: 'template';
      template: {
        name: string;
        language: { code: string };
        components: {
          type: 'body' | 'header' | 'footer' | 'button';
          parameters?: { type: 'text'; text: string }[];
        }[];
      };
    }
  | {
      to: string;
      type: 'text';
      text: { body: string; preview_url?: boolean };
    };

export async function sendWhatsAppMessage(
  payload: WhatsAppMessagePayload
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

// --- Env-var fallback (remove after DB migration validated) ---

let envFallback: Record<string, Correspondent[]> | null = null;

function getEnvFallback(): Record<string, Correspondent[]> {
  if (envFallback !== null) return envFallback;
  const raw = Deno.env.get('BAJOUR_CORRESPONDENTS');
  if (!raw) {
    envFallback = {};
    return envFallback;
  }
  // Env stores phones with '+', normalize to without
  const parsed: Record<string, { name: string; phone: string }[]> = JSON.parse(raw);
  envFallback = {};
  for (const [villageId, correspondents] of Object.entries(parsed)) {
    envFallback[villageId] = correspondents.map((c) => ({
      name: c.name,
      phone: normalizePhone(c.phone),
    }));
  }
  return envFallback;
}

function normalizePhone(phone: string): string {
  return phone.replace(/^\+/, '');
}

// --- DB query functions ---

export async function getCorrespondentsForVillage(
  villageId: string
): Promise<Correspondent[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('bajour_correspondents')
    .select('name, phone')
    .eq('village_id', villageId)
    .eq('is_active', true);

  if (error) {
    console.warn(
      'FALLBACK: bajour_correspondents query failed, using env secret:',
      error.message
    );
    return getEnvFallback()[villageId] || [];
  }

  if (data && data.length > 0) {
    return data as Correspondent[];
  }

  // No rows found — try env fallback
  const fallback = getEnvFallback()[villageId] || [];
  if (fallback.length > 0) {
    console.warn(
      'FALLBACK: No DB correspondents for village',
      villageId,
      '— using env secret. Migrate data to bajour_correspondents table.'
    );
  }
  return fallback;
}

export async function findCorrespondentByPhone(
  phone: string
): Promise<{ villageId: string; name: string; phone: string } | null> {
  const normalized = normalizePhone(phone);
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('bajour_correspondents')
    .select('village_id, name, phone')
    .eq('phone', normalized)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn(
      'FALLBACK: bajour_correspondents phone lookup failed, using env secret:',
      error.message
    );
    return findCorrespondentInEnv(normalized);
  }

  if (data) {
    return { villageId: data.village_id, name: data.name, phone: data.phone };
  }

  // Not found in DB — try env fallback
  const fallback = findCorrespondentInEnv(normalized);
  if (fallback) {
    console.warn(
      'FALLBACK: Phone not in DB, found in env secret. Migrate data to bajour_correspondents table.'
    );
  }
  return fallback;
}

export async function getCorrespondentCount(
  villageId: string
): Promise<number> {
  const supabase = createServiceClient();

  const { count, error } = await supabase
    .from('bajour_correspondents')
    .select('id', { count: 'exact', head: true })
    .eq('village_id', villageId)
    .eq('is_active', true);

  if (error) {
    console.warn(
      'FALLBACK: bajour_correspondents count failed, using env secret:',
      error.message
    );
    return (getEnvFallback()[villageId] || []).length;
  }

  if (count !== null && count > 0) {
    return count;
  }

  // Zero in DB — check env fallback
  const fallbackCount = (getEnvFallback()[villageId] || []).length;
  if (fallbackCount > 0) {
    console.warn(
      'FALLBACK: Zero DB correspondents for village',
      villageId,
      '— env secret has',
      fallbackCount,
      '. Migrate data to bajour_correspondents table.'
    );
  }
  return fallbackCount;
}

// --- Env fallback helpers ---

function findCorrespondentInEnv(
  normalizedPhone: string
): { villageId: string; name: string; phone: string } | null {
  for (const [villageId, correspondents] of Object.entries(getEnvFallback())) {
    for (const c of correspondents) {
      if (c.phone === normalizedPhone) {
        return { villageId, name: c.name, phone: c.phone };
      }
    }
  }
  return null;
}
