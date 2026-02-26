// Bajour API client

import { api } from '../lib/api';
import type { BajourDraft, BajourDraftGenerated, VerificationStatus } from './types';

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

  updateDraft: (draftId: string, data: { verification_status?: VerificationStatus }) =>
    api.patch<BajourDraft>(`bajour-drafts/${draftId}`, data),

  selectUnits: (data: { village_id: string; scout_id: string; recency_days?: number; selection_prompt?: string }) =>
    api.post<{ selected_unit_ids: string[] }>('bajour-select-units', data),
  generateDraft: (data: {
    village_id: string;
    village_name: string;
    unit_ids: string[];
    custom_system_prompt?: string;
  }) => api.post<BajourDraftGenerated>('bajour-generate-draft', data),

  sendVerification: (draftId: string) =>
    api.post<{ sent_count: number }>('bajour-send-verification', { draft_id: draftId }),

  sendToMailchimp: () =>
    api.post<{ campaign_id: string; village_count: number }>('bajour-send-mailchimp', {}),
};
