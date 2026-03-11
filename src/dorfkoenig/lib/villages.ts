// Village config: shared village list + scout ID mapping for Bajour integration.

import gemeindenJson from './gemeinden.json';
import type { Village } from '../bajour/types';

export const villages: Village[] = gemeindenJson;

// Village → Scout ID mapping (fixed UUIDs per village)
const VILLAGE_SCOUT_IDS: Record<string, string> = {
  riehen: 'ba000000-0001-4000-a000-000000000001',
  bettingen: 'ba000000-0002-4000-a000-000000000002',
  allschwil: 'ba000000-0003-4000-a000-000000000003',
  binningen: 'ba000000-0004-4000-a000-000000000004',
  arlesheim: 'ba000000-0005-4000-a000-000000000005',
  muttenz: 'ba000000-0006-4000-a000-000000000006',
  muenchenstein: 'ba000000-0007-4000-a000-000000000007',
  reinach: 'ba000000-0008-4000-a000-000000000008',
  oberwil: 'ba000000-0009-4000-a000-000000000009',
  birsfelden: 'ba000000-000a-4000-a000-00000000000a',
};

export function getScoutIdForVillage(villageId: string): string | undefined {
  return VILLAGE_SCOUT_IDS[villageId];
}

export function getVillageByName(name: string): Village | undefined {
  const lower = name.toLowerCase();
  return villages.find(v => v.name.toLowerCase() === lower);
}
