// Bajour API client — typed helpers for village newsletter workflow edge functions.

import { api } from '../lib/api';
import type { BajourDraft, BajourDraftGenerated, VerificationStatus } from './types';

export const bajourApi = {
  /** List all drafts for the current user. */
  listDrafts: () => api.get<BajourDraft[]>('bajour-drafts'),

  /** Create a new draft with generated body and selected unit IDs. */
  createDraft: (data: {
    village_id: string;
    village_name: string;
    title: string | null;
    body: string;
    selected_unit_ids: string[];
    custom_system_prompt?: string | null;
  }) => api.post<BajourDraft>('bajour-drafts', data),

  /** Update a draft's verification status (ausstehend/bestaetigt/abgelehnt). */
  updateDraft: (draftId: string, data: { verification_status?: VerificationStatus }) =>
    api.patch<BajourDraft>(`bajour-drafts/${draftId}`, data),

  /** LLM-powered selection of relevant units for a village newsletter. */
  selectUnits: (data: { village_id: string; scout_id: string; recency_days?: number; selection_prompt?: string }) =>
    api.post<{ selected_unit_ids: string[] }>('bajour-select-units', data),

  /** Generate newsletter draft body from selected units via LLM. */
  generateDraft: (data: {
    village_id: string;
    village_name: string;
    unit_ids: string[];
    custom_system_prompt?: string;
  }) => api.post<BajourDraftGenerated>('bajour-generate-draft', data),

  /** Send draft to village correspondents via WhatsApp for verification. */
  sendVerification: (draftId: string) =>
    api.post<{ sent_count: number }>('bajour-send-verification', { draft_id: draftId }),

  /** Aggregate all verified drafts into a Mailchimp campaign. */
  sendToMailchimp: () =>
    api.post<{ campaign_id: string; village_count: number }>('bajour-send-mailchimp', {}),
};
