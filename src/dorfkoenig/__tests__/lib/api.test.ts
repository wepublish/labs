import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock auth module before importing api
vi.mock('../../stores/auth', () => ({
  getUserId: vi.fn(() => 'test-user-123'),
}));

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Set env vars before module import
vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');

// Import after mocks are in place
const { api, scoutsApi, unitsApi, composeApi, ApiClientError } = await import('../../lib/api');
const { getUserId } = await import('../../stores/auth');

function createMockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function createNoContentResponse(): Response {
  return {
    ok: true,
    status: 204,
    json: vi.fn(),
  } as unknown as Response;
}

describe('api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserId).mockReturnValue('test-user-123');
  });

  describe('get', () => {
    it('sends GET with correct Authorization and x-user-id headers', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ data: [] }));

      await api.get('scouts');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.supabase.co/functions/v1/scouts',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-anon-key',
            'x-user-id': 'test-user-123',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('throws ApiClientError with 401 when getUserId returns null', async () => {
      vi.mocked(getUserId).mockReturnValue(null);

      await expect(api.get('scouts')).rejects.toThrow(ApiClientError);
      await expect(api.get('scouts')).rejects.toMatchObject({
        message: 'Nicht authentifiziert',
        status: 401,
      });
    });

    it('unwraps { data: ... } response envelope', async () => {
      const scouts = [{ id: '1', name: 'Scout 1' }];
      mockFetch.mockResolvedValue(createMockResponse({ data: scouts }));

      const result = await api.get('scouts');

      expect(result).toEqual(scouts);
    });

    it('throws ApiClientError with status and code on error response', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(
          { error: { message: 'Nicht gefunden', code: 'NOT_FOUND' } },
          404
        )
      );

      await expect(api.get('scouts/missing')).rejects.toMatchObject({
        message: 'Nicht gefunden',
        status: 404,
        code: 'NOT_FOUND',
      });
    });
  });

  describe('delete', () => {
    it('handles 204 no-content response', async () => {
      mockFetch.mockResolvedValue(createNoContentResponse());

      const result = await api.delete('scouts/123');

      expect(result).toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.supabase.co/functions/v1/scouts/123',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('post', () => {
    it('sends POST with JSON body', async () => {
      const body = { name: 'New Scout', url: 'https://example.com' };
      mockFetch.mockResolvedValue(
        createMockResponse({ data: { id: '1', ...body } })
      );

      await api.post('scouts', body);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.supabase.co/functions/v1/scouts',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body),
        })
      );
    });
  });
});

describe('scoutsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserId).mockReturnValue('test-user-123');
  });

  it('list() calls GET /scouts', async () => {
    mockFetch.mockResolvedValue(createMockResponse({ data: [] }));

    await scoutsApi.list();

    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.supabase.co/functions/v1/scouts',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('create() sends topic in body', async () => {
    const scout = { id: '1', name: 'Test', topic: 'Stadtentwicklung, Verkehr' };
    mockFetch.mockResolvedValue(createMockResponse({ data: scout }));

    await scoutsApi.create({
      name: 'Test',
      url: 'https://example.com',
      criteria: '',
      frequency: 'daily',
      topic: 'Stadtentwicklung, Verkehr',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.supabase.co/functions/v1/scouts',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"topic":"Stadtentwicklung, Verkehr"'),
      })
    );
  });

  it('update() sends topic in body', async () => {
    const scout = { id: 'scout-1', name: 'Test', topic: 'Verkehr' };
    mockFetch.mockResolvedValue(createMockResponse({ data: scout }));

    await scoutsApi.update('scout-1', { topic: 'Verkehr' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.supabase.co/functions/v1/scouts/scout-1',
      expect.objectContaining({
        method: 'PUT',
        body: expect.stringContaining('"topic":"Verkehr"'),
      })
    );
  });

  it('run() calls POST /scouts/:id/run', async () => {
    mockFetch.mockResolvedValue(
      createMockResponse({
        data: { execution_id: 'exec-1', status: 'running', message: 'Started' },
      })
    );

    await scoutsApi.run('scout-42', { skip_notification: true });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.supabase.co/functions/v1/scouts/scout-42/run',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ skip_notification: true }),
      })
    );
  });
});

describe('unitsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserId).mockReturnValue('test-user-123');
  });

  it('list() calls GET /units with default params', async () => {
    mockFetch.mockResolvedValue(createMockResponse({ data: [] }));

    await unitsApi.list();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://test.supabase.co/functions/v1/units'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('list() includes topic query param when provided', async () => {
    mockFetch.mockResolvedValue(createMockResponse({ data: [] }));

    await unitsApi.list({ topic: 'Stadtentwicklung' });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('topic=Stadtentwicklung');
  });

  it('list() includes location_city query param', async () => {
    mockFetch.mockResolvedValue(createMockResponse({ data: [] }));

    await unitsApi.list({ location_city: 'Berlin' });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('location_city=Berlin');
  });

  it('list() does not include topic param when not provided', async () => {
    mockFetch.mockResolvedValue(createMockResponse({ data: [] }));

    await unitsApi.list({ location_city: 'Berlin' });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain('topic=');
  });

  it('list() combines location_city and topic params', async () => {
    mockFetch.mockResolvedValue(createMockResponse({ data: [] }));

    await unitsApi.list({ location_city: 'Berlin', topic: 'Verkehr' });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('location_city=Berlin');
    expect(calledUrl).toContain('topic=Verkehr');
  });
});

describe('composeApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserId).mockReturnValue('test-user-123');
  });

  it('generate() calls POST /compose/generate with unit_ids', async () => {
    const draft = { title: 'Test', headline: 'Lede', sections: [], gaps: [], sources: [], word_count: 0, units_used: 1 };
    mockFetch.mockResolvedValue(createMockResponse({ data: draft }));

    await composeApi.generate({ unit_ids: ['u1', 'u2'] });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.supabase.co/functions/v1/compose/generate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ unit_ids: ['u1', 'u2'] }),
      })
    );
  });

  it('generate() includes custom_system_prompt when provided', async () => {
    const draft = { title: 'Test', headline: '', sections: [], gaps: [], sources: [], word_count: 0, units_used: 1 };
    mockFetch.mockResolvedValue(createMockResponse({ data: draft }));

    await composeApi.generate({
      unit_ids: ['u1'],
      custom_system_prompt: 'Schreibe kurz und prägnant',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.custom_system_prompt).toBe('Schreibe kurz und prägnant');
  });

  it('generate() does not include custom_system_prompt when not provided', async () => {
    const draft = { title: 'Test', headline: '', sections: [], gaps: [], sources: [], word_count: 0, units_used: 1 };
    mockFetch.mockResolvedValue(createMockResponse({ data: draft }));

    await composeApi.generate({ unit_ids: ['u1'] });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.custom_system_prompt).toBeUndefined();
  });
});
