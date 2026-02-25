// Bajour Drafts Store

import { writable, get } from 'svelte/store';
import { bajourApi } from '../lib/api';
import type { BajourDraft } from '../lib/types';

interface BajourDraftsState {
  drafts: BajourDraft[];
  loading: boolean;
  error: string | null;
}

function createBajourDraftsStore() {
  const store = writable<BajourDraftsState>({
    drafts: [],
    loading: false,
    error: null,
  });

  const { subscribe, update } = store;

  let pollInterval: ReturnType<typeof setInterval> | null = null;

  return {
    subscribe,

    /**
     * Load all Bajour drafts for current user
     */
    async load() {
      update((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await bajourApi.listDrafts();
        update((s) => ({ ...s, drafts: data, loading: false }));
      } catch (error) {
        update((s) => ({ ...s, error: (error as Error).message, loading: false }));
      }
    },

    /**
     * Create a new Bajour draft
     */
    async create(data: {
      village_id: string;
      village_name: string;
      title: string | null;
      body: string;
      selected_unit_ids: string[];
      custom_system_prompt?: string | null;
    }): Promise<BajourDraft> {
      const draft = await bajourApi.createDraft(data);
      update((s) => ({ ...s, drafts: [draft, ...s.drafts] }));
      return draft;
    },

    /**
     * Send verification for a draft
     */
    async sendVerification(draftId: string): Promise<{ sent_count: number }> {
      return bajourApi.sendVerification(draftId);
    },

    /**
     * Start polling for verification status updates (every 30s)
     */
    startPolling() {
      this.stopPolling();
      pollInterval = setInterval(async () => {
        const state = get(store);
        const hasPending = state.drafts.some(
          (d) => d.verification_status === 'ausstehend'
        );
        if (!hasPending) {
          this.stopPolling();
          return;
        }
        await this.load();
      }, 30000);
    },

    /**
     * Stop polling
     */
    stopPolling() {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    },

    /**
     * Clear error
     */
    clearError() {
      update((s) => ({ ...s, error: null }));
    },
  };
}

export const bajourDrafts = createBajourDraftsStore();
