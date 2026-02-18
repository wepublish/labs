import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// Mock the API module before importing the store
vi.mock('../../lib/api', () => ({
  scoutsApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    run: vi.fn(),
    test: vi.fn(),
  },
}));

const { scoutsApi } = await import('../../lib/api');
const { scouts, scoutsCount } = await import(
  '../../stores/scouts'
);

import type { Scout } from '../../lib/types';

function makeScout(overrides: Partial<Scout> = {}): Scout {
  return {
    id: 'scout-1',
    user_id: 'user-1',
    name: 'Test Scout',
    url: 'https://example.com',
    criteria: 'test criteria',
    location: null,
    frequency: 'daily',
    is_active: true,
    last_run_at: null,
    consecutive_failures: 0,
    notification_email: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    last_execution_status: null,
    last_criteria_matched: null,
    last_change_status: null,
    last_summary_text: null,
    ...overrides,
  };
}

describe('scouts store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state by loading an empty list
    vi.mocked(scoutsApi.list).mockResolvedValue([]);
    return scouts.load().then(() => {
      vi.clearAllMocks();
    });
  });

  describe('load', () => {
    it('fetches scouts and updates state', async () => {
      const mockScouts = [makeScout({ id: 'a' }), makeScout({ id: 'b' })];
      vi.mocked(scoutsApi.list).mockResolvedValue(mockScouts);

      await scouts.load();

      const state = get(scouts);
      expect(state.scouts).toEqual(mockScouts);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(scoutsApi.list).toHaveBeenCalledOnce();
    });

    it('sets error on API failure', async () => {
      vi.mocked(scoutsApi.list).mockRejectedValue(
        new Error('Netzwerkfehler')
      );

      await scouts.load();

      const state = get(scouts);
      expect(state.error).toBe('Netzwerkfehler');
      expect(state.loading).toBe(false);
    });
  });

  describe('create', () => {
    it('prepends new scout to the list', async () => {
      const existing = makeScout({ id: 'existing' });
      vi.mocked(scoutsApi.list).mockResolvedValue([existing]);
      await scouts.load();

      const newScout = makeScout({ id: 'new-scout', name: 'New Scout' });
      vi.mocked(scoutsApi.create).mockResolvedValue(newScout);

      const result = await scouts.create({
        name: 'New Scout',
        url: 'https://example.com',
        criteria: 'test',
        frequency: 'daily',
      });

      const state = get(scouts);
      expect(result).toEqual(newScout);
      expect(state.scouts[0].id).toBe('new-scout');
      expect(state.scouts[1].id).toBe('existing');
    });

    it('passes topic field to API when provided', async () => {
      const newScout = makeScout({ id: 'topic-scout', topic: 'Stadtentwicklung, Verkehr' });
      vi.mocked(scoutsApi.create).mockResolvedValue(newScout);

      await scouts.create({
        name: 'Topic Scout',
        url: 'https://example.com',
        criteria: '',
        frequency: 'daily',
        topic: 'Stadtentwicklung, Verkehr',
      });

      expect(scoutsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ topic: 'Stadtentwicklung, Verkehr' })
      );
    });

    it('creates scout without topic (null)', async () => {
      const newScout = makeScout({ id: 'no-topic' });
      vi.mocked(scoutsApi.create).mockResolvedValue(newScout);

      await scouts.create({
        name: 'No Topic Scout',
        url: 'https://example.com',
        criteria: 'test',
        frequency: 'daily',
      });

      const callArg = vi.mocked(scoutsApi.create).mock.calls[0][0];
      expect(callArg.topic).toBeUndefined();
    });
  });

  describe('update', () => {
    it('replaces scout in list by ID', async () => {
      const original = makeScout({ id: 'scout-1', name: 'Original' });
      vi.mocked(scoutsApi.list).mockResolvedValue([original]);
      await scouts.load();

      const updated = makeScout({ id: 'scout-1', name: 'Updated' });
      vi.mocked(scoutsApi.update).mockResolvedValue(updated);

      const result = await scouts.update('scout-1', { name: 'Updated' });

      const state = get(scouts);
      expect(result.name).toBe('Updated');
      expect(state.scouts[0].name).toBe('Updated');
      expect(state.scouts).toHaveLength(1);
    });

    it('updates scout topic', async () => {
      const original = makeScout({ id: 'scout-1', topic: null });
      vi.mocked(scoutsApi.list).mockResolvedValue([original]);
      await scouts.load();

      const updated = makeScout({ id: 'scout-1', topic: 'Verkehr' });
      vi.mocked(scoutsApi.update).mockResolvedValue(updated);

      const result = await scouts.update('scout-1', { topic: 'Verkehr' });

      expect(result.topic).toBe('Verkehr');
      expect(scoutsApi.update).toHaveBeenCalledWith(
        'scout-1',
        expect.objectContaining({ topic: 'Verkehr' })
      );
    });

    it('clears scout topic by setting null', async () => {
      const original = makeScout({ id: 'scout-1', topic: 'Verkehr' });
      vi.mocked(scoutsApi.list).mockResolvedValue([original]);
      await scouts.load();

      const updated = makeScout({ id: 'scout-1', topic: null });
      vi.mocked(scoutsApi.update).mockResolvedValue(updated);

      const result = await scouts.update('scout-1', { topic: null });

      expect(result.topic).toBeNull();
    });
  });

  describe('get', () => {
    it('returns a scout by ID', async () => {
      const mockScout = makeScout({ id: 'scout-1' });
      vi.mocked(scoutsApi.get).mockResolvedValue(mockScout);

      const result = await scouts.get('scout-1');

      expect(result).toEqual(mockScout);
      expect(scoutsApi.get).toHaveBeenCalledWith('scout-1');
    });

    it('returns null on API failure', async () => {
      vi.mocked(scoutsApi.get).mockRejectedValue(new Error('Not found'));

      const result = await scouts.get('missing');

      expect(result).toBeNull();
    });
  });

  describe('run', () => {
    it('calls scoutsApi.run with id and options', async () => {
      const mockResult = { execution_id: 'exec-1', status: 'running', message: 'Started' };
      vi.mocked(scoutsApi.run).mockResolvedValue(mockResult);

      const result = await scouts.run('scout-1', { extract_units: true });

      expect(result).toEqual(mockResult);
      expect(scoutsApi.run).toHaveBeenCalledWith('scout-1', { extract_units: true });
    });

    it('calls scoutsApi.run without options', async () => {
      const mockResult = { execution_id: 'exec-1', status: 'running', message: 'Started' };
      vi.mocked(scoutsApi.run).mockResolvedValue(mockResult);

      await scouts.run('scout-1');

      expect(scoutsApi.run).toHaveBeenCalledWith('scout-1', undefined);
    });

    it('propagates errors from the API', async () => {
      vi.mocked(scoutsApi.run).mockRejectedValue(new Error('Scout nicht gefunden'));

      await expect(scouts.run('bad-id')).rejects.toThrow('Scout nicht gefunden');
    });
  });

  describe('test', () => {
    it('returns test result with successful scrape', async () => {
      const mockResult = {
        scrape_result: { success: true, word_count: 500, title: 'Test Page' },
        criteria_analysis: { matches: true, summary: 'Matches criteria', key_findings: ['Found relevant content'] },
        would_notify: true,
        would_extract_units: true,
      };
      vi.mocked(scoutsApi.test).mockResolvedValue(mockResult);

      const result = await scouts.test('scout-1');

      expect(result).toEqual(mockResult);
      expect(scoutsApi.test).toHaveBeenCalledWith('scout-1');
    });

    it('returns test result with failed scrape', async () => {
      const mockResult = {
        scrape_result: { success: false, error: 'Connection timeout' },
        criteria_analysis: null,
        would_notify: false,
        would_extract_units: false,
      };
      vi.mocked(scoutsApi.test).mockResolvedValue(mockResult);

      const result = await scouts.test('scout-1');

      expect(result.scrape_result.success).toBe(false);
      expect(result.criteria_analysis).toBeNull();
    });

    it('propagates errors from the API', async () => {
      vi.mocked(scoutsApi.test).mockRejectedValue(new Error('Netzwerkfehler'));

      await expect(scouts.test('scout-1')).rejects.toThrow('Netzwerkfehler');
    });
  });

  describe('delete', () => {
    it('removes scout from list', async () => {
      const s1 = makeScout({ id: 'keep' });
      const s2 = makeScout({ id: 'remove' });
      vi.mocked(scoutsApi.list).mockResolvedValue([s1, s2]);
      await scouts.load();

      vi.mocked(scoutsApi.delete).mockResolvedValue(undefined);

      await scouts.delete('remove');

      const state = get(scouts);
      expect(state.scouts).toHaveLength(1);
      expect(state.scouts[0].id).toBe('keep');
    });
  });

  describe('clearError', () => {
    it('resets error to null', async () => {
      vi.mocked(scoutsApi.list).mockRejectedValue(new Error('Some error'));
      await scouts.load();
      expect(get(scouts).error).toBe('Some error');

      scouts.clearError();

      expect(get(scouts).error).toBeNull();
    });
  });

  describe('enrichment fields', () => {
    it('load() preserves enrichment fields from API response', async () => {
      const enrichedScout = makeScout({
        id: 'enriched-1',
        last_execution_status: 'completed',
        last_criteria_matched: true,
        last_change_status: 'changed',
        last_summary_text: 'Neue Entwicklungen in Zürich.',
      });
      vi.mocked(scoutsApi.list).mockResolvedValue([enrichedScout]);

      await scouts.load();

      const state = get(scouts);
      expect(state.scouts[0].last_execution_status).toBe('completed');
      expect(state.scouts[0].last_criteria_matched).toBe(true);
      expect(state.scouts[0].last_change_status).toBe('changed');
      expect(state.scouts[0].last_summary_text).toBe(
        'Neue Entwicklungen in Zürich.'
      );
    });

    it('enrichment fields default to null for scouts without executions', async () => {
      const noExec = makeScout({ id: 'no-exec' });
      vi.mocked(scoutsApi.list).mockResolvedValue([noExec]);

      await scouts.load();

      const state = get(scouts);
      expect(state.scouts[0].last_execution_status).toBeNull();
      expect(state.scouts[0].last_criteria_matched).toBeNull();
      expect(state.scouts[0].last_change_status).toBeNull();
      expect(state.scouts[0].last_summary_text).toBeNull();
    });
  });
});

describe('derived stores', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const mockScouts = [
      makeScout({ id: 'active-1', is_active: true }),
      makeScout({ id: 'active-2', is_active: true }),
      makeScout({ id: 'inactive-1', is_active: false }),
    ];
    vi.mocked(scoutsApi.list).mockResolvedValue(mockScouts);
    await scouts.load();
  });

  describe('scoutsCount', () => {
    it('returns the total number of scouts', () => {
      expect(get(scoutsCount)).toBe(3);
    });
  });
});
