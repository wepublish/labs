// Village correspondents — loaded from bajour_correspondents DB table.
// Phones stored WITHOUT '+' prefix (matches Meta webhook format).
// Falls back to BAJOUR_CORRESPONDENTS env secret with a logged warning.

import { createServiceClient } from './supabase-client.ts';

export interface Correspondent {
  name: string;
  phone: string; // without '+' prefix
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
