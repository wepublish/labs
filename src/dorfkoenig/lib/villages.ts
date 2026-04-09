// Village config: shared village list for Bajour integration.
// Canonical source: gemeinden.json — do not duplicate village data elsewhere.

import gemeindenJson from './gemeinden.json';
import type { Village } from '../bajour/types';

export const villages: Village[] = gemeindenJson;

export function getScoutIdForVillage(villageId: string): string | undefined {
  return villages.find(v => v.id === villageId)?.scout_id;
}

export function getVillageByName(name: string): Village | undefined {
  const lower = name.toLowerCase();
  return villages.find(v => v.name.toLowerCase() === lower);
}
