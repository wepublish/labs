import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

/**
 * Tests for the scout creation wizard flow.
 *
 * The wizard (ScoutModal) orchestrates these store operations:
 *   Step 1: scouts.create({ is_active: false }) → scouts.test(id)
 *   Step 2: scouts.update(id, { name, frequency, is_active: true }) → scouts.run(id)
 *   Abort:  scouts.delete(id)  (cleanup draft)
 *
 * These tests verify the store layer behaves correctly for each scenario.
 */

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
const { scouts } = await import('../../stores/scouts');

import type { Scout, TestResult } from '../../lib/types';

function makeScout(overrides: Partial<Scout> = {}): Scout {
  return {
    id: 'draft-1',
    user_id: 'user-1',
    name: 'example.com',
    url: 'https://example.com',
    criteria: '',
    location: null,
    frequency: 'daily',
    is_active: false,
    last_run_at: null,
    consecutive_failures: 0,
    notification_email: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeTestResult(overrides: Partial<TestResult> = {}): TestResult {
  return {
    scrape_result: { success: true, word_count: 1200, title: 'Example News' },
    criteria_analysis: null,
    would_notify: false,
    would_extract_units: true,
    ...overrides,
  };
}

describe('scout wizard flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(scoutsApi.list).mockResolvedValue([]);
    return scouts.load().then(() => {
      vi.clearAllMocks();
    });
  });

  describe('step 1: create draft and test', () => {
    it('creates an inactive draft scout', async () => {
      const draft = makeScout({ id: 'draft-1', is_active: false });
      vi.mocked(scoutsApi.create).mockResolvedValue(draft);

      const result = await scouts.create({
        name: 'example.com',
        url: 'https://example.com',
        criteria: '',
        frequency: 'daily',
        is_active: false,
      });

      expect(result.is_active).toBe(false);
      expect(scoutsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: false })
      );

      // Draft should appear in store
      const state = get(scouts);
      expect(state.scouts).toHaveLength(1);
      expect(state.scouts[0].id).toBe('draft-1');
    });

    it('creates draft with location data', async () => {
      const draft = makeScout({
        id: 'draft-loc',
        location: { city: 'Berlin', country: 'Germany', latitude: 52.52, longitude: 13.405 },
      });
      vi.mocked(scoutsApi.create).mockResolvedValue(draft);

      await scouts.create({
        name: 'example.com',
        url: 'https://example.com',
        criteria: '',
        frequency: 'daily',
        is_active: false,
        location: { city: 'Berlin', country: 'Germany', latitude: 52.52, longitude: 13.405 },
      });

      expect(scoutsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          location: { city: 'Berlin', country: 'Germany', latitude: 52.52, longitude: 13.405 },
        })
      );
    });

    it('creates draft with topic instead of location', async () => {
      const draft = makeScout({ id: 'draft-topic', topic: 'Stadtentwicklung, Verkehr' });
      vi.mocked(scoutsApi.create).mockResolvedValue(draft);

      await scouts.create({
        name: 'example.com',
        url: 'https://example.com',
        criteria: '',
        frequency: 'daily',
        is_active: false,
        topic: 'Stadtentwicklung, Verkehr',
      });

      expect(scoutsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ topic: 'Stadtentwicklung, Verkehr' })
      );
    });

    it('creates draft with specific criteria', async () => {
      const draft = makeScout({ id: 'draft-criteria', criteria: 'Neubau Wohnungen' });
      vi.mocked(scoutsApi.create).mockResolvedValue(draft);

      await scouts.create({
        name: 'example.com',
        url: 'https://example.com',
        criteria: 'Neubau Wohnungen',
        frequency: 'daily',
        is_active: false,
      });

      expect(scoutsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ criteria: 'Neubau Wohnungen' })
      );
    });

    it('tests a draft scout and returns scrape results', async () => {
      const draft = makeScout({ id: 'draft-1' });
      vi.mocked(scoutsApi.create).mockResolvedValue(draft);
      await scouts.create({
        name: 'example.com',
        url: 'https://example.com',
        criteria: '',
        frequency: 'daily',
        is_active: false,
      });

      const testResult = makeTestResult();
      vi.mocked(scoutsApi.test).mockResolvedValue(testResult);

      const result = await scouts.test('draft-1');

      expect(result.scrape_result.success).toBe(true);
      expect(result.scrape_result.word_count).toBe(1200);
      expect(scoutsApi.test).toHaveBeenCalledWith('draft-1');
    });

    it('test returns criteria analysis when criteria are set', async () => {
      const testResult = makeTestResult({
        criteria_analysis: {
          matches: true,
          summary: 'Relevante Inhalte zu Neubau gefunden',
          key_findings: ['3 Wohnbauprojekte erwähnt'],
        },
      });
      vi.mocked(scoutsApi.test).mockResolvedValue(testResult);

      const result = await scouts.test('draft-1');

      expect(result.criteria_analysis).not.toBeNull();
      expect(result.criteria_analysis!.matches).toBe(true);
      expect(result.criteria_analysis!.key_findings).toHaveLength(1);
    });

    it('test returns failed scrape result', async () => {
      const testResult = makeTestResult({
        scrape_result: { success: false, error: 'Seite nicht erreichbar' },
        criteria_analysis: null,
        would_notify: false,
        would_extract_units: false,
      });
      vi.mocked(scoutsApi.test).mockResolvedValue(testResult);

      const result = await scouts.test('draft-1');

      expect(result.scrape_result.success).toBe(false);
      expect(result.scrape_result.error).toBe('Seite nicht erreichbar');
    });
  });

  describe('step 2: configure and activate', () => {
    it('updates draft scout with final name, frequency, and activates it', async () => {
      const draft = makeScout({ id: 'draft-1', is_active: false });
      vi.mocked(scoutsApi.create).mockResolvedValue(draft);
      await scouts.create({
        name: 'example.com',
        url: 'https://example.com',
        criteria: '',
        frequency: 'daily',
        is_active: false,
      });

      const activated = makeScout({
        id: 'draft-1',
        name: 'Berlin Nachrichten',
        frequency: 'weekly',
        is_active: true,
      });
      vi.mocked(scoutsApi.update).mockResolvedValue(activated);

      const result = await scouts.update('draft-1', {
        name: 'Berlin Nachrichten',
        frequency: 'weekly',
        is_active: true,
      });

      expect(result.name).toBe('Berlin Nachrichten');
      expect(result.frequency).toBe('weekly');
      expect(result.is_active).toBe(true);
      expect(scoutsApi.update).toHaveBeenCalledWith('draft-1', {
        name: 'Berlin Nachrichten',
        frequency: 'weekly',
        is_active: true,
      });
    });

    it('supports biweekly frequency', async () => {
      const updated = makeScout({ id: 'draft-1', frequency: 'biweekly', is_active: true });
      vi.mocked(scoutsApi.update).mockResolvedValue(updated);

      const result = await scouts.update('draft-1', { frequency: 'biweekly', is_active: true });

      expect(result.frequency).toBe('biweekly');
    });

    it('triggers first run after activation', async () => {
      const runResult = { execution_id: 'exec-1', status: 'running', message: 'Started' };
      vi.mocked(scoutsApi.run).mockResolvedValue(runResult);

      const result = await scouts.run('draft-1', { extract_units: false });

      expect(result.execution_id).toBe('exec-1');
      expect(scoutsApi.run).toHaveBeenCalledWith('draft-1', { extract_units: false });
    });

    it('triggers first run with extract_units enabled (baseline import)', async () => {
      const runResult = { execution_id: 'exec-2', status: 'running', message: 'Started' };
      vi.mocked(scoutsApi.run).mockResolvedValue(runResult);

      const result = await scouts.run('draft-1', { extract_units: true });

      expect(result).toEqual(runResult);
      expect(scoutsApi.run).toHaveBeenCalledWith('draft-1', { extract_units: true });
    });
  });

  describe('abort: cleanup draft on close', () => {
    it('deletes draft scout when wizard is cancelled', async () => {
      const draft = makeScout({ id: 'draft-to-delete', is_active: false });
      vi.mocked(scoutsApi.create).mockResolvedValue(draft);
      await scouts.create({
        name: 'example.com',
        url: 'https://example.com',
        criteria: '',
        frequency: 'daily',
        is_active: false,
      });

      // Verify draft exists in store
      expect(get(scouts).scouts).toHaveLength(1);

      vi.mocked(scoutsApi.delete).mockResolvedValue(undefined);
      await scouts.delete('draft-to-delete');

      // Verify draft removed from store
      expect(get(scouts).scouts).toHaveLength(0);
      expect(scoutsApi.delete).toHaveBeenCalledWith('draft-to-delete');
    });

    it('handles delete failure gracefully (draft may already be gone)', async () => {
      vi.mocked(scoutsApi.delete).mockRejectedValue(new Error('Not found'));

      // Should propagate the error — the modal catches this with .catch(console.warn)
      await expect(scouts.delete('gone-draft')).rejects.toThrow('Not found');
    });
  });

  describe('full wizard sequence', () => {
    it('completes full create → test → configure → activate → run flow', async () => {
      // Step 1a: Create inactive draft
      const draft = makeScout({ id: 'wizard-scout', is_active: false });
      vi.mocked(scoutsApi.create).mockResolvedValue(draft);

      const created = await scouts.create({
        name: 'example.com',
        url: 'https://example.com/news',
        criteria: 'Bauprojekte',
        frequency: 'daily',
        is_active: false,
        location: { city: 'Zürich', country: 'Switzerland' },
      });
      expect(created.id).toBe('wizard-scout');

      // Step 1b: Test the draft
      const testResult = makeTestResult({
        scrape_result: { success: true, word_count: 850, title: 'Nachrichten Zürich' },
        criteria_analysis: {
          matches: true,
          summary: 'Bauprojekte gefunden',
          key_findings: ['Neubau am Hauptbahnhof'],
        },
      });
      vi.mocked(scoutsApi.test).mockResolvedValue(testResult);

      const tested = await scouts.test('wizard-scout');
      expect(tested.scrape_result.success).toBe(true);

      // Step 2a: Configure and activate
      const activated = makeScout({
        id: 'wizard-scout',
        name: 'Zürich Bauprojekte',
        frequency: 'weekly',
        is_active: true,
      });
      vi.mocked(scoutsApi.update).mockResolvedValue(activated);

      const updated = await scouts.update('wizard-scout', {
        name: 'Zürich Bauprojekte',
        frequency: 'weekly',
        is_active: true,
      });
      expect(updated.is_active).toBe(true);

      // Step 2b: Trigger first run
      vi.mocked(scoutsApi.run).mockResolvedValue({
        execution_id: 'exec-first',
        status: 'running',
        message: 'Started',
      });

      const run = await scouts.run('wizard-scout', { extract_units: true });
      expect(run.execution_id).toBe('exec-first');

      // Verify store state: scout is in the list and active
      const state = get(scouts);
      const storeScout = state.scouts.find(s => s.id === 'wizard-scout');
      expect(storeScout).toBeDefined();
      expect(storeScout!.is_active).toBe(true);
      expect(storeScout!.name).toBe('Zürich Bauprojekte');

      // Verify call sequence
      expect(scoutsApi.create).toHaveBeenCalledTimes(1);
      expect(scoutsApi.test).toHaveBeenCalledTimes(1);
      expect(scoutsApi.update).toHaveBeenCalledTimes(1);
      expect(scoutsApi.run).toHaveBeenCalledTimes(1);
    });

    it('re-creates draft if test is retried (old draft deleted first)', async () => {
      // First draft
      const draft1 = makeScout({ id: 'draft-v1', is_active: false });
      vi.mocked(scoutsApi.create).mockResolvedValue(draft1);
      await scouts.create({
        name: 'example.com',
        url: 'https://example.com',
        criteria: '',
        frequency: 'daily',
        is_active: false,
      });

      // Delete old draft (wizard does this before re-creating)
      vi.mocked(scoutsApi.delete).mockResolvedValue(undefined);
      await scouts.delete('draft-v1');
      expect(get(scouts).scouts).toHaveLength(0);

      // Second draft with different URL
      const draft2 = makeScout({ id: 'draft-v2', url: 'https://other.com', is_active: false });
      vi.mocked(scoutsApi.create).mockResolvedValue(draft2);
      await scouts.create({
        name: 'other.com',
        url: 'https://other.com',
        criteria: '',
        frequency: 'daily',
        is_active: false,
      });

      expect(get(scouts).scouts).toHaveLength(1);
      expect(get(scouts).scouts[0].id).toBe('draft-v2');
    });
  });
});
