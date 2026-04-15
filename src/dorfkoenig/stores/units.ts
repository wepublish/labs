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
  dateFrom: string | null;
  dateTo: string | null;
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
    dateFrom: null,
    dateTo: null,
    searchQuery: '',
    loading: false,
    error: null,
  });

  return {
    subscribe,

    async loadLocations() {
      try {
        const data = await unitsApi.locations();
        update((s) => ({ ...s, locations: data }));
      } catch (error) {
        console.error('Failed to load locations:', error);
      }
    },

    async load(locationCity?: string, unusedOnly = true, topic?: string, dateFrom?: string, dateTo?: string) {
      update((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await unitsApi.list({
          location_city: locationCity,
          unused_only: unusedOnly,
          limit: 100,
          ...(topic && { topic }),
          ...(dateFrom && { date_from: dateFrom }),
          ...(dateTo && { date_to: dateTo }),
        });
        const topics = [...new Set(data.filter(u => u.topic).map(u => u.topic!))].sort();
        update((s) => ({ ...s, units: data, topics, loading: false }));
      } catch (error) {
        update((s) => ({ ...s, error: (error as Error).message, loading: false }));
      }
    },

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

    setLocation(city: string | null) {
      update((s) => ({ ...s, selectedLocation: city }));
    },

    setTopic(topic: string | null) {
      update((s) => ({ ...s, selectedTopic: topic }));
    },

    setDateRange(from: string | null, to: string | null) {
      update((s) => ({ ...s, dateFrom: from, dateTo: to }));
    },

    clearSearch() {
      update((s) => ({ ...s, searchQuery: '' }));
    },

    async markUsed(unitIds: string[]) {
      await unitsApi.markUsed(unitIds);
      update((s) => ({
        ...s,
        units: s.units.filter((u) => !unitIds.includes(u.id)),
      }));
    },

    clearError() {
      update((s) => ({ ...s, error: null }));
    },
  };
}

export const units = createUnitsStore();
