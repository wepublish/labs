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

  return {
    subscribe,

    /**
     * Load all scouts for current user
     */
    async load() {
      update((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await scoutsApi.list();
        update((s) => ({ ...s, scouts: data, loading: false }));
      } catch (error) {
        update((s) => ({ ...s, error: (error as Error).message, loading: false }));
      }
    },

    /**
     * Get a single scout by ID
     */
    async get(id: string): Promise<Scout | null> {
      try {
        return await scoutsApi.get(id);
      } catch {
        return null;
      }
    },

    /**
     * Create a new scout
     */
    async create(input: ScoutCreateInput): Promise<Scout> {
      const data = await scoutsApi.create(input);
      update((s) => ({ ...s, scouts: [data, ...s.scouts] }));
      return data;
    },

    /**
     * Update an existing scout
     */
    async update(id: string, input: ScoutUpdateInput): Promise<Scout> {
      const data = await scoutsApi.update(id, input);
      update((s) => ({
        ...s,
        scouts: s.scouts.map((sc) => (sc.id === id ? data : sc)),
      }));
      return data;
    },

    /**
     * Delete a scout
     */
    async delete(id: string): Promise<void> {
      await scoutsApi.delete(id);
      update((s) => ({
        ...s,
        scouts: s.scouts.filter((sc) => sc.id !== id),
      }));
    },

    /**
     * Run a scout (trigger execution)
     */
    async run(
      id: string,
      options?: { skip_notification?: boolean; extract_units?: boolean }
    ): Promise<RunResult> {
      return scoutsApi.run(id, options);
    },

    /**
     * Test a scout (preview without side effects)
     */
    async test(id: string): Promise<TestResult> {
      return scoutsApi.test(id);
    },

    /**
     * Clear error
     */
    clearError() {
      update((s) => ({ ...s, error: null }));
    },
  };
}

export const scouts = createScoutsStore();

// Derived stores
export const scoutsCount = derived(scouts, ($s) => $s.scouts.length);
