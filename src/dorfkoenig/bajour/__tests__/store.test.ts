import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

vi.mock('../api', () => ({
  bajourApi: {
    listDrafts: vi.fn(),
    createDraft: vi.fn(),
    sendVerification: vi.fn(),
  },
}));

const { bajourApi } = await import('../api');
const { bajourDrafts } = await import('../store');

import type { BajourDraft } from '../types';

function makeDraft(overrides: Partial<BajourDraft> = {}): BajourDraft {
  return {
    id: 'draft-1',
    user_id: 'user-1',
    village_id: 'riehen',
    village_name: 'Riehen',
    title: 'Wochenüberblick Riehen',
    body: 'Test body',
    selected_unit_ids: ['u-1', 'u-2'],
    custom_system_prompt: null,
    verification_status: 'ausstehend',
    verification_responses: [],
    verification_sent_at: null,
    verification_resolved_at: null,
    verification_timeout_at: null,
    whatsapp_message_ids: [],
    created_at: '2026-02-25T10:00:00Z',
    updated_at: '2026-02-25T10:00:00Z',
    ...overrides,
  };
}

describe('bajourDrafts store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Reset store by loading empty
    vi.mocked(bajourApi.listDrafts).mockResolvedValue([]);
    return bajourDrafts.load().then(() => vi.clearAllMocks());
  });

  afterEach(() => {
    bajourDrafts.stopPolling();
    vi.useRealTimers();
  });

  describe('load', () => {
    it('fetches drafts and updates state', async () => {
      const mockDrafts = [makeDraft({ id: 'a' }), makeDraft({ id: 'b' })];
      vi.mocked(bajourApi.listDrafts).mockResolvedValue(mockDrafts);

      await bajourDrafts.load();

      const state = get(bajourDrafts);
      expect(state.drafts).toEqual(mockDrafts);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('sets error on API failure', async () => {
      vi.mocked(bajourApi.listDrafts).mockRejectedValue(new Error('Netzwerkfehler'));

      await bajourDrafts.load();

      expect(get(bajourDrafts).error).toBe('Netzwerkfehler');
      expect(get(bajourDrafts).loading).toBe(false);
    });
  });

  describe('create', () => {
    it('prepends new draft to the list', async () => {
      const existing = makeDraft({ id: 'existing' });
      vi.mocked(bajourApi.listDrafts).mockResolvedValue([existing]);
      await bajourDrafts.load();

      const newDraft = makeDraft({ id: 'new-draft' });
      vi.mocked(bajourApi.createDraft).mockResolvedValue(newDraft);

      const result = await bajourDrafts.create({
        village_id: 'riehen',
        village_name: 'Riehen',
        title: 'Test',
        body: 'Test body',
        selected_unit_ids: ['u-1'],
      });

      const state = get(bajourDrafts);
      expect(result.id).toBe('new-draft');
      expect(state.drafts[0].id).toBe('new-draft');
      expect(state.drafts[1].id).toBe('existing');
    });
  });

  describe('sendVerification', () => {
    it('delegates to bajourApi.sendVerification', async () => {
      vi.mocked(bajourApi.sendVerification).mockResolvedValue({ sent_count: 2 });

      const result = await bajourDrafts.sendVerification('draft-1');

      expect(result).toEqual({ sent_count: 2 });
      expect(bajourApi.sendVerification).toHaveBeenCalledWith('draft-1');
    });
  });

  describe('polling', () => {
    it('polls every 30s when there are pending drafts', async () => {
      const pendingDraft = makeDraft({ verification_status: 'ausstehend' });
      vi.mocked(bajourApi.listDrafts).mockResolvedValue([pendingDraft]);
      await bajourDrafts.load();
      vi.clearAllMocks();

      vi.mocked(bajourApi.listDrafts).mockResolvedValue([pendingDraft]);
      bajourDrafts.startPolling();

      await vi.advanceTimersByTimeAsync(30000);
      expect(bajourApi.listDrafts).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(30000);
      expect(bajourApi.listDrafts).toHaveBeenCalledTimes(2);
    });

    it('auto-stops polling when no drafts are pending', async () => {
      const resolvedDraft = makeDraft({ verification_status: 'bestätigt' });
      vi.mocked(bajourApi.listDrafts).mockResolvedValue([resolvedDraft]);
      await bajourDrafts.load();
      vi.clearAllMocks();

      vi.mocked(bajourApi.listDrafts).mockResolvedValue([resolvedDraft]);
      bajourDrafts.startPolling();

      await vi.advanceTimersByTimeAsync(30000);
      // Should have called once, then stopped
      expect(bajourApi.listDrafts).toHaveBeenCalledTimes(0);

      await vi.advanceTimersByTimeAsync(30000);
      // Should NOT have called again
      expect(bajourApi.listDrafts).toHaveBeenCalledTimes(0);
    });

    it('stopPolling() clears the interval', async () => {
      const pendingDraft = makeDraft({ verification_status: 'ausstehend' });
      vi.mocked(bajourApi.listDrafts).mockResolvedValue([pendingDraft]);
      await bajourDrafts.load();
      vi.clearAllMocks();

      bajourDrafts.startPolling();
      bajourDrafts.stopPolling();

      vi.mocked(bajourApi.listDrafts).mockResolvedValue([pendingDraft]);
      await vi.advanceTimersByTimeAsync(30000);
      expect(bajourApi.listDrafts).not.toHaveBeenCalled();
    });
  });

  describe('clearError', () => {
    it('resets error to null', async () => {
      vi.mocked(bajourApi.listDrafts).mockRejectedValue(new Error('fail'));
      await bajourDrafts.load();
      expect(get(bajourDrafts).error).toBe('fail');

      bajourDrafts.clearError();

      expect(get(bajourDrafts).error).toBeNull();
    });
  });
});
