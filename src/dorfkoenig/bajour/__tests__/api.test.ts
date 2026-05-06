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
      selection_diagnostics: {
        selected_unit_ids: ['u-1'],
        selected_units: [{ id: 'u-1', statement: 'Test unit', score: 80, reasons: ['fresh'] }],
        rejected_top_units: [],
      },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.supabase.co/functions/v1/bajour-drafts',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"village_id":"riehen"'),
      })
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.selection_diagnostics.selected_units[0].score).toBe(80);
  });

  it('selectUnits() calls POST /bajour-select-units', async () => {
    const diagnostics = {
      selected_unit_ids: ['u-1', 'u-2'],
      selected_units: [{ id: 'u-1', statement: 'Selected', score: 90, reasons: ['public_safety'] }],
      rejected_top_units: [{ id: 'u-3', statement: 'Rejected', score: 20, reasons: ['weak_url'] }],
    };
    mockFetch.mockResolvedValue(createMockResponse({ data: { selected_unit_ids: ['u-1', 'u-2'], selection_diagnostics: diagnostics } }));
    const result = await bajourApi.selectUnits({ village_id: 'riehen' });
    expect(result).toEqual({ selected_unit_ids: ['u-1', 'u-2'], selection_diagnostics: diagnostics });
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

});
