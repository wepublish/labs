// Village correspondents — loaded from BAJOUR_CORRESPONDENTS env secret at startup.
// Format: JSON object mapping village_id -> array of { name, phone }.
// Set via: Supabase Dashboard > Settings > Edge Functions > Secrets
//
// Example value for BAJOUR_CORRESPONDENTS:
// {"riehen":[{"name":"Alice","phone":"+41791234567"}],"bettingen":[...]}

export interface Correspondent {
  name: string;
  phone: string;
}

const raw = Deno.env.get('BAJOUR_CORRESPONDENTS');

export const VILLAGE_CORRESPONDENTS: Record<string, Correspondent[]> = raw
  ? JSON.parse(raw)
  : {};
