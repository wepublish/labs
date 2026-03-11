// Scouts Store

import { writable, derived } from 'svelte/store';
import { scoutsApi } from '../lib/api';
import type { Scout, ScoutCreateInput, ScoutUpdateInput, TestResult, RunResult } from '../lib/types';

interface ScoutsState {
  scouts: Scout[];
  loading: boolean;
  error: string | null;
}

function createScoutsStore() {
  const { subscribe, update } = writable<ScoutsState>({
    scouts: [],
    loading: false,
    error: null,
  });

  async function load() {
    update((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await scoutsApi.list();
      update((s) => ({ ...s, scouts: data, loading: false }));
    } catch (error) {
      update((s) => ({ ...s, error: (error as Error).message, loading: false }));
    }
  }

  return {
    subscribe,
    load,

    async get(id: string): Promise<Scout | null> {
      try {
        return await scoutsApi.get(id);
      } catch {
        return null;
      }
    },

    async create(input: ScoutCreateInput): Promise<Scout> {
      const data = await scoutsApi.create(input);
      update((s) => ({ ...s, scouts: [data, ...s.scouts] }));
      return data;
    },

    async update(id: string, input: ScoutUpdateInput): Promise<Scout> {
      const data = await scoutsApi.update(id, input);
      update((s) => ({
        ...s,
        scouts: s.scouts.map((sc) => (sc.id === id ? data : sc)),
      }));
      return data;
    },

    async delete(id: string): Promise<void> {
      // Optimistic: remove from local state immediately (synchronous)
      update((s) => ({
        ...s,
        scouts: s.scouts.filter((sc) => sc.id !== id),
      }));
      try {
        await scoutsApi.delete(id);
      } catch (error) {
        // Revert: re-fetch server state
        await load();
        throw error;
      }
    },

    async run(
      id: string,
      options?: { skip_notification?: boolean; extract_units?: boolean }
    ): Promise<RunResult> {
      return scoutsApi.run(id, options);
    },

    async test(id: string): Promise<TestResult> {
      return scoutsApi.test(id);
    },

    clearError() {
      update((s) => ({ ...s, error: null }));
    },
  };
}

export const scouts = createScoutsStore();

// Derived stores
export const scoutsCount = derived(scouts, ($s) => $s.scouts.length);
