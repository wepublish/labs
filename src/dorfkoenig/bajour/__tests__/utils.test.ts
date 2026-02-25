import { describe, it, expect, vi, afterEach } from 'vitest';
import type { BajourDraft } from '../types';

const { displayStatus } = await import('../utils');

function makeDraft(overrides: Partial<BajourDraft> = {}): BajourDraft {
  return {
    id: 'draft-1',
    user_id: 'user-1',
    village_id: 'riehen',
    village_name: 'Riehen',
    title: null,
    body: 'Test',
    selected_unit_ids: [],
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

describe('displayStatus', () => {
  afterEach(() => vi.useRealTimers());

  it('returns ausstehend when no timeout set', () => {
    const draft = makeDraft({ verification_status: 'ausstehend', verification_timeout_at: null });
    expect(displayStatus(draft)).toBe('ausstehend');
  });

  it('returns ausstehend when timeout is in the future', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-25T10:00:00Z'));

    const draft = makeDraft({
      verification_status: 'ausstehend',
      verification_timeout_at: '2026-02-25T12:00:00Z', // 2 hours in the future
    });
    expect(displayStatus(draft)).toBe('ausstehend');
  });

  it('returns bestätigt when timeout has passed and still ausstehend', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-25T13:00:00Z'));

    const draft = makeDraft({
      verification_status: 'ausstehend',
      verification_timeout_at: '2026-02-25T12:00:00Z', // 1 hour in the past
    });
    expect(displayStatus(draft)).toBe('bestätigt');
  });

  it('returns bestätigt when already confirmed', () => {
    const draft = makeDraft({ verification_status: 'bestätigt' });
    expect(displayStatus(draft)).toBe('bestätigt');
  });

  it('returns abgelehnt when already rejected', () => {
    const draft = makeDraft({ verification_status: 'abgelehnt' });
    expect(displayStatus(draft)).toBe('abgelehnt');
  });
});
