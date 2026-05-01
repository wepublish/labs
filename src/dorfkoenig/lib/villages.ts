// Village config: shared village list for Bajour integration.
// Canonical source: gemeinden.json — do not duplicate village data elsewhere.

import { writable, type Writable } from 'svelte/store';
import gemeindenJson from './gemeinden.json';
import type { Village } from '../bajour/types';
import { supabase } from './supabase';

export const villages: Village[] = gemeindenJson;
export const fallbackPilotVillageIds = ['arlesheim', 'muenchenstein'] as const;

export function getVillageByName(name: string): Village | undefined {
  const lower = name.toLowerCase();
  return villages.find(v => v.name.toLowerCase() === lower);
}

/**
 * Pilot allow-list — mirrors the `bajour_pilot_villages_list` table that
 * gates the 18:00 auto-draft cron. `null` while the list is loading or after
 * an error. The browser can occasionally receive an empty result while the
 * table/policy is being rolled out, so read helpers fall back to the seeded
 * pilot villages instead of hiding all data.
 */
export const pilotVillages: Writable<string[] | null> = writable(null);

export async function loadPilotVillages(): Promise<void> {
  const { data, error } = await supabase
    .from('bajour_pilot_villages_list')
    .select('village_id');
  if (error) {
    console.warn('loadPilotVillages failed:', error.message);
    pilotVillages.set(null);
    return;
  }
  pilotVillages.set((data ?? []).map((r) => r.village_id));
}

export function getActivePilotVillageIds(pilotList: string[] | null): string[] {
  if (pilotList && pilotList.length > 0) return pilotList;
  return [...fallbackPilotVillageIds];
}

export function getActiveVillages(pilotList: string[] | null): Village[] {
  const activeIds = new Set(getActivePilotVillageIds(pilotList));
  return villages.filter((village) => activeIds.has(village.id));
}

export function isVillageActive(
  villageId: string,
  pilotList: string[] | null,
): boolean {
  return getActivePilotVillageIds(pilotList).includes(villageId);
}
