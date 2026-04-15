// Bajour API client — typed helpers for village newsletter workflow edge functions.

import { api, ApiClientError } from '../lib/api';
import type { ApiError } from '../lib/types';
import type { BajourDraft, VerificationStatus } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Admin deep-link fetch: signed URL is the auth, no x-user-id needed.
 * Used when the admin mailbox receives a rejection alert and clicks through.
 */
async function fetchDraftAdmin(
  id: string,
  sig: string,
  exp: string
): Promise<BajourDraft> {
  const params = new URLSearchParams({ id, sig, exp });
  const url = `${SUPABASE_URL}/functions/v1/bajour-get-draft-admin?${params.toString()}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiErr = result as ApiError;
    throw new ApiClientError(
      apiErr.error?.message || `HTTP ${response.status}`,
      response.status,
      apiErr.error?.code
    );
  }
  return (result.data !== undefined ? result.data : result) as BajourDraft;
}

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
    publication_date?: string;
  }) => api.post<BajourDraft>('bajour-drafts', data),

  /** Update a draft's verification status or publication date. */
  updateDraft: (draftId: string, data: { verification_status?: VerificationStatus; publication_date?: string }) =>
    api.patch<BajourDraft>(`bajour-drafts/${draftId}`, data),

  /** Delete a draft. */
  deleteDraft: (draftId: string) => api.delete(`bajour-drafts/${draftId}`),

  /** LLM-powered selection of relevant units for a village newsletter. */
  selectUnits: (data: { village_id: string; scout_id: string; recency_days?: number; selection_prompt?: string }) =>
    api.post<{ selected_unit_ids: string[] }>('bajour-select-units', data),

  /** Send draft to village correspondents via WhatsApp for verification. */
  sendVerification: (draftId: string) =>
    api.post<{ sent_count: number }>('bajour-send-verification', { draft_id: draftId }),

  /** Fetch the current INFORMATION_SELECT_PROMPT template from the backend. */
  getSelectPrompt: () => api.get<{ prompt: string }>('bajour-select-units'),

  /**
   * Fetch a single draft via an HMAC-signed admin link (no user session required).
   * Used when the admin mailbox receives a rejection alert and clicks through.
   */
  getDraftAdmin: (id: string, sig: string, exp: string) => fetchDraftAdmin(id, sig, exp),
};
