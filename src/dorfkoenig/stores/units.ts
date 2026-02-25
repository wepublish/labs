// Units Store

import { writable } from 'svelte/store';
import { unitsApi } from '../lib/api';
import type { InformationUnit, Location } from '../lib/types';

interface UnitsState {
  units: InformationUnit[];
  locations: Location[];
  topics: string[];
  selectedLocation: string | null;
  selectedTopic: string | null;
  searchQuery: string;
  loading: boolean;
  error: string | null;
}

function createUnitsStore() {
  const { subscribe, update } = writable<UnitsState>({
    units: [],
    locations: [],
    topics: [],
    selectedLocation: null,
    selectedTopic: null,
    searchQuery: '',
    loading: false,
    error: null,
  });

  return {
    subscribe,

    /**
     * Load available locations for filter
     */
    async loadLocations() {
      try {
        const data = await unitsApi.locations();
        update((s) => ({ ...s, locations: data }));
      } catch (error) {
        console.error('Failed to load locations:', error);
      }
    },

    /**
     * Load units with optional filters
     */
    async load(locationCity?: string, unusedOnly = true, topic?: string) {
      update((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await unitsApi.list({
          location_city: locationCity,
          unused_only: unusedOnly,
          limit: 100,
          ...(topic && { topic }),
        });
        const topics = [...new Set(data.filter(u => u.topic).map(u => u.topic!))].sort();
        update((s) => ({ ...s, units: data, topics, loading: false }));
      } catch (error) {
        update((s) => ({ ...s, error: (error as Error).message, loading: false }));
      }
    },

    /**
     * Semantic search for units
     */
    async search(query: string, locationCity?: string, topic?: string) {
      update((s) => ({ ...s, loading: true, searchQuery: query, error: null }));
      try {
        const data = await unitsApi.search(query, {
          location_city: locationCity,
          ...(topic && { topic }),
          min_similarity: 0.3,
        });
        update((s) => ({ ...s, units: data, loading: false }));
      } catch (error) {
        update((s) => ({ ...s, error: (error as Error).message, loading: false }));
      }
    },

    /**
     * Set selected location filter
     */
    setLocation(city: string | null) {
      update((s) => ({ ...s, selectedLocation: city }));
    },

    /**
     * Set selected topic filter
     */
    setTopic(topic: string | null) {
      update((s) => ({ ...s, selectedTopic: topic }));
    },

    /**
     * Clear search query
     */
    clearSearch() {
      update((s) => ({ ...s, searchQuery: '' }));
    },

    /**
     * Mark units as used in article
     */
    async markUsed(unitIds: string[]) {
      await unitsApi.markUsed(unitIds);
      // Remove marked units from the list
      update((s) => ({
        ...s,
        units: s.units.filter((u) => !unitIds.includes(u.id)),
      }));
    },

    /**
     * Clear error
     */
    clearError() {
      update((s) => ({ ...s, error: null }));
    },
  };
}

export const units = createUnitsStore();
