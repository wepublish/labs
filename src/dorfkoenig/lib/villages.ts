// Village config: shared village list for Bajour integration.
// Canonical source: gemeinden.json — do not duplicate village data elsewhere.

import { writable, type Writable } from 'svelte/store';
import gemeindenJson from './gemeinden.json';
import type { Village } from '../bajour/types';
import { supabase } from './supabase';

export const villages: Village[] = gemeindenJson;

export function getVillageByName(name: string): Village | undefined {
  const lower = name.toLowerCase();
  return villages.find(v => v.name.toLowerCase() === lower);
}

/**
 * Pilot allow-list — mirrors the `bajour_pilot_villages_list` table that
 * gates the 18:00 auto-draft cron. `null` while the list is loading or after
 * an error; once loaded, an empty array means "no village is in the pilot"
 * (all draft-trigger surfaces should be disabled). Only draft-trigger UI
 * (AISelectDropdown) should gate on this — extraction runs for all 10
 * villages regardless.
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

export function isVillageActive(
  villageId: string,
  pilotList: string[] | null,
): boolean {
  // While loading (null): don't block anything — the user will see the list
  // refresh once the fetch resolves. Once loaded, enforce membership.
  if (pilotList === null) return true;
  return pilotList.includes(villageId);
}
