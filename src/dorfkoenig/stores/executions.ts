// Executions Store

import { writable } from 'svelte/store';
import { executionsApi } from '../lib/api';
import type { Execution } from '../lib/types';

interface ExecutionsState {
  executions: Execution[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  offset: number;
}

const LIMIT = 20;

function createExecutionsStore() {
  const { subscribe, update } = writable<ExecutionsState>({
    executions: [],
    loading: false,
    error: null,
    hasMore: true,
    offset: 0,
  });

  return {
    subscribe,

    /**
     * Load executions with optional scout filter
     */
    async load(scoutId?: string, reset = true) {
      update((s) => ({
        ...s,
        loading: true,
        error: null,
        ...(reset ? { executions: [], offset: 0 } : {}),
      }));

      try {
        const currentOffset = reset ? 0 : (await new Promise<number>((resolve) => {
          const unsub = subscribe((s) => {
            resolve(s.offset);
            unsub();
          });
        }));

        const data = await executionsApi.list({
          scout_id: scoutId,
          limit: LIMIT,
          offset: currentOffset,
        });

        update((s) => ({
          ...s,
          executions: reset ? data : [...s.executions, ...data],
          hasMore: data.length === LIMIT,
          offset: currentOffset + LIMIT,
          loading: false,
        }));
      } catch (error) {
        update((s) => ({ ...s, error: (error as Error).message, loading: false }));
      }
    },

    /**
     * Load more executions (pagination)
     */
    async loadMore(scoutId?: string) {
      await this.load(scoutId, false);
    },

    /**
     * Get single execution with details
     */
    async getDetail(id: string): Promise<Execution | null> {
      try {
        return await executionsApi.get(id);
      } catch {
        return null;
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

export const executions = createExecutionsStore();
