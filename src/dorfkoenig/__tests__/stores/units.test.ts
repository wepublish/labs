import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// Mock the API module before importing the store
vi.mock('../../lib/api', () => ({
  unitsApi: {
    list: vi.fn(),
    locations: vi.fn(),
    search: vi.fn(),
    markUsed: vi.fn(),
  },
}));

const { unitsApi } = await import('../../lib/api');
const { units } = await import('../../stores/units');

import type { InformationUnit } from '../../lib/types';

function makeUnit(overrides: Partial<InformationUnit> = {}): InformationUnit {
  return {
    id: 'unit-1',
    statement: 'Test statement',
    unit_type: 'fact',
    entities: ['Entity1'],
    source_url: 'https://example.com',
    source_domain: 'example.com',
    source_title: 'Test Article',
    location: { city: 'Berlin', country: 'Germany' },
    created_at: '2024-01-01T00:00:00Z',
    used_in_article: false,
    ...overrides,
  };
}

describe('units store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    vi.mocked(unitsApi.list).mockResolvedValue([]);
    return units.load().then(() => {
      vi.clearAllMocks();
    });
  });

  describe('load', () => {
    it('fetches units and updates state', async () => {
      const mockUnits = [makeUnit({ id: 'a' }), makeUnit({ id: 'b' })];
      vi.mocked(unitsApi.list).mockResolvedValue(mockUnits);

      await units.load();

      const state = get(units);
      expect(state.units).toEqual(mockUnits);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(unitsApi.list).toHaveBeenCalledOnce();
    });

    it('passes location_city to API', async () => {
      vi.mocked(unitsApi.list).mockResolvedValue([]);

      await units.load('Berlin');

      expect(unitsApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ location_city: 'Berlin' })
      );
    });

    it('passes topic to API when provided', async () => {
      vi.mocked(unitsApi.list).mockResolvedValue([]);

      await units.load(undefined, true, 'Stadtentwicklung');

      expect(unitsApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ topic: 'Stadtentwicklung' })
      );
    });

    it('does not include topic param when not provided', async () => {
      vi.mocked(unitsApi.list).mockResolvedValue([]);

      await units.load('Berlin');

      const callArgs = vi.mocked(unitsApi.list).mock.calls[0][0];
      expect(callArgs).not.toHaveProperty('topic');
    });

    it('derives topics from loaded units', async () => {
      const mockUnits = [
        makeUnit({ id: 'a', topic: 'Stadtentwicklung' }),
        makeUnit({ id: 'b', topic: 'Verkehr' }),
        makeUnit({ id: 'c', topic: 'Stadtentwicklung' }),
        makeUnit({ id: 'd' }), // no topic
      ];
      vi.mocked(unitsApi.list).mockResolvedValue(mockUnits);

      await units.load();

      const state = get(units);
      expect(state.topics).toEqual(['Stadtentwicklung', 'Verkehr']);
    });

    it('sets error on API failure', async () => {
      vi.mocked(unitsApi.list).mockRejectedValue(new Error('Netzwerkfehler'));

      await units.load();

      const state = get(units);
      expect(state.error).toBe('Netzwerkfehler');
      expect(state.loading).toBe(false);
    });
  });

  describe('search', () => {
    it('calls search API with query', async () => {
      vi.mocked(unitsApi.search).mockResolvedValue([]);

      await units.search('Bauprojekt');

      expect(unitsApi.search).toHaveBeenCalledWith('Bauprojekt', {
        location_city: undefined,
        min_similarity: 0.3,
      });
    });

    it('passes location_city to search', async () => {
      vi.mocked(unitsApi.search).mockResolvedValue([]);

      await units.search('test', 'Berlin');

      expect(unitsApi.search).toHaveBeenCalledWith('test', {
        location_city: 'Berlin',
        min_similarity: 0.3,
      });
    });
  });

  describe('setLocation / setTopic', () => {
    it('updates selectedLocation', () => {
      units.setLocation('München');

      expect(get(units).selectedLocation).toBe('München');
    });

    it('updates selectedTopic', () => {
      units.setTopic('Verkehr');

      expect(get(units).selectedTopic).toBe('Verkehr');
    });
  });

  describe('markUsed', () => {
    it('removes marked units from list', async () => {
      const mockUnits = [makeUnit({ id: 'keep' }), makeUnit({ id: 'used' })];
      vi.mocked(unitsApi.list).mockResolvedValue(mockUnits);
      await units.load();

      vi.mocked(unitsApi.markUsed).mockResolvedValue({ marked_count: 1 });
      await units.markUsed(['used']);

      const state = get(units);
      expect(state.units).toHaveLength(1);
      expect(state.units[0].id).toBe('keep');
    });
  });

  describe('clearError', () => {
    it('resets error to null', async () => {
      vi.mocked(unitsApi.list).mockRejectedValue(new Error('Some error'));
      await units.load();
      expect(get(units).error).toBe('Some error');

      units.clearError();

      expect(get(units).error).toBeNull();
    });
  });
});
