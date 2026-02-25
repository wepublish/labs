// Bajour API client

import { api } from '../lib/api';
import type { BajourDraft, BajourDraftGenerated } from './types';

export const bajourApi = {
  listDrafts: () => api.get<BajourDraft[]>('bajour-drafts'),
  createDraft: (data: {
    village_id: string;
    village_name: string;
    title: string | null;
    body: string;
    selected_unit_ids: string[];
    custom_system_prompt?: string | null;
  }) => api.post<BajourDraft>('bajour-drafts', data),

  selectUnits: (data: { village_id: string; scout_id: string }) =>
    api.post<{ selected_unit_ids: string[] }>('bajour-select-units', data),
  generateDraft: (data: {
    village_id: string;
    village_name: string;
    unit_ids: string[];
    custom_system_prompt?: string;
  }) => api.post<BajourDraftGenerated>('bajour-generate-draft', data),

  sendVerification: (draftId: string) =>
    api.post<{ sent_count: number }>('bajour-send-verification', { draft_id: draftId }),
};
