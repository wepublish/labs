import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../stores/auth', () => ({
  getUserId: vi.fn(() => 'test-user-123'),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');

const { bajourApi } = await import('../api');

function createMockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('bajourApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listDrafts() calls GET /bajour-drafts', async () => {
    mockFetch.mockResolvedValue(createMockResponse({ data: [] }));
    await bajourApi.listDrafts();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.supabase.co/functions/v1/bajour-drafts',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('createDraft() calls POST /bajour-drafts with body', async () => {
    const draft = { id: 'd-1', village_id: 'riehen', village_name: 'Riehen' };
    mockFetch.mockResolvedValue(createMockResponse({ data: draft }));

    await bajourApi.createDraft({
      village_id: 'riehen',
      village_name: 'Riehen',
      title: 'Test',
      body: 'Draft body',
      selected_unit_ids: ['u-1'],
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.supabase.co/functions/v1/bajour-drafts',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"village_id":"riehen"'),
      })
    );
  });

  it('selectUnits() calls POST /bajour-select-units', async () => {
    mockFetch.mockResolvedValue(createMockResponse({ data: { selected_unit_ids: ['u-1', 'u-2'] } }));
    const result = await bajourApi.selectUnits({ village_id: 'riehen', scout_id: 'ba000000-0001-4000-a000-000000000001' });
    expect(result).toEqual({ selected_unit_ids: ['u-1', 'u-2'] });
  });

  it('generateDraft() calls POST /bajour-generate-draft', async () => {
    const generated = { title: 'Test', greeting: 'Liebe Leser', sections: [], outlook: '', sign_off: '' };
    mockFetch.mockResolvedValue(createMockResponse({ data: generated }));

    const result = await bajourApi.generateDraft({
      village_id: 'riehen',
      village_name: 'Riehen',
      unit_ids: ['u-1'],
    });
    expect(result.title).toBe('Test');
  });

  it('generateDraft() passes custom_system_prompt when provided', async () => {
    mockFetch.mockResolvedValue(createMockResponse({ data: { title: 'X', greeting: '', sections: [], outlook: '', sign_off: '' } }));

    await bajourApi.generateDraft({
      village_id: 'riehen',
      village_name: 'Riehen',
      unit_ids: ['u-1'],
      custom_system_prompt: 'Write formally',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"custom_system_prompt":"Write formally"'),
      })
    );
  });

  it('sendVerification() calls POST /bajour-send-verification with draft_id', async () => {
    mockFetch.mockResolvedValue(createMockResponse({ data: { sent_count: 2 } }));
    const result = await bajourApi.sendVerification('draft-123');
    expect(result).toEqual({ sent_count: 2 });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.supabase.co/functions/v1/bajour-send-verification',
      expect.objectContaining({
        body: expect.stringContaining('"draft_id":"draft-123"'),
      })
    );
  });

  it('updateDraft() calls PATCH /bajour-drafts/{id} with verification_status', async () => {
    const updated = { id: 'd-1', verification_status: 'bestätigt' };
    mockFetch.mockResolvedValue(createMockResponse({ data: updated }));

    const result = await bajourApi.updateDraft('d-1', { verification_status: 'bestätigt' });

    expect(result).toEqual(updated);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.supabase.co/functions/v1/bajour-drafts/d-1',
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"verification_status":"bestätigt"'),
      })
    );
  });

  it('sendToMailchimp() calls POST /bajour-send-mailchimp', async () => {
    const result = { campaign_id: 'camp-1', village_count: 3 };
    mockFetch.mockResolvedValue(createMockResponse({ data: result }));

    const response = await bajourApi.sendToMailchimp();

    expect(response).toEqual(result);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.supabase.co/functions/v1/bajour-send-mailchimp',
      expect.objectContaining({
        method: 'POST',
        body: '{}',
      })
    );
  });
});
