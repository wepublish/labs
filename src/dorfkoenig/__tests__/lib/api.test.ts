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
const { api, scoutsApi, unitsApi, composeApi, executionsApi, ApiClientError } = await import('../../lib/api');
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

  it('get() calls GET /scouts/:id', async () => {
    const scout = { id: 'scout-1', name: 'My Scout' };
    mockFetch.mockResolvedValue(createMockResponse({ data: scout }));

    const result = await scoutsApi.get('scout-1');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.supabase.co/functions/v1/scouts/scout-1',
      expect.objectContaining({ method: 'GET' })
    );
    expect(result).toEqual(scout);
  });

  it('delete() calls DELETE /scouts/:id', async () => {
    mockFetch.mockResolvedValue(createNoContentResponse());

    await scoutsApi.delete('scout-1');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.supabase.co/functions/v1/scouts/scout-1',
      expect.objectContaining({ method: 'DELETE' })
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

  it('run() sends extract_units option', async () => {
    mockFetch.mockResolvedValue(
      createMockResponse({
        data: { execution_id: 'exec-1', status: 'running', message: 'Started' },
      })
    );

    await scoutsApi.run('scout-1', { extract_units: true });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.extract_units).toBe(true);
  });

  it('test() calls POST /scouts/:id/test', async () => {
    const testResult = {
      scrape_result: { success: true, word_count: 500, title: 'Test' },
      criteria_analysis: null,
      would_notify: false,
      would_extract_units: true,
    };
    mockFetch.mockResolvedValue(createMockResponse({ data: testResult }));

    const result = await scoutsApi.test('scout-1');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.supabase.co/functions/v1/scouts/scout-1/test',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result).toEqual(testResult);
  });

  it('create() sends is_active in body', async () => {
    const scout = { id: '1', name: 'Draft' };
    mockFetch.mockResolvedValue(createMockResponse({ data: scout }));

    await scoutsApi.create({
      name: 'Draft',
      url: 'https://example.com',
      criteria: '',
      frequency: 'daily',
      is_active: false,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.is_active).toBe(false);
  });

  it('create() sends location object in body', async () => {
    const scout = { id: '1', name: 'Loc Scout' };
    mockFetch.mockResolvedValue(createMockResponse({ data: scout }));

    await scoutsApi.create({
      name: 'Loc Scout',
      url: 'https://example.com',
      criteria: '',
      frequency: 'daily',
      location: { city: 'Berlin', country: 'Germany', latitude: 52.52, longitude: 13.405 },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.location).toEqual({ city: 'Berlin', country: 'Germany', latitude: 52.52, longitude: 13.405 });
  });

  it('update() sends is_active and frequency', async () => {
    const scout = { id: 'scout-1', name: 'Test' };
    mockFetch.mockResolvedValue(createMockResponse({ data: scout }));

    await scoutsApi.update('scout-1', { is_active: true, frequency: 'biweekly' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.is_active).toBe(true);
    expect(body.frequency).toBe('biweekly');
  });
});

describe('executionsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserId).mockReturnValue('test-user-123');
  });

  it('list() calls GET /executions with default params', async () => {
    mockFetch.mockResolvedValue(createMockResponse({ data: [] }));

    await executionsApi.list();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://test.supabase.co/functions/v1/executions'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('list() filters by scout_id', async () => {
    mockFetch.mockResolvedValue(createMockResponse({ data: [] }));

    await executionsApi.list({ scout_id: 'scout-1' });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('scout_id=scout-1');
  });

  it('list() supports pagination with limit and offset', async () => {
    mockFetch.mockResolvedValue(createMockResponse({ data: [] }));

    await executionsApi.list({ limit: 10, offset: 20 });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('limit=10');
    expect(calledUrl).toContain('offset=20');
  });

  it('list() filters by status', async () => {
    mockFetch.mockResolvedValue(createMockResponse({ data: [] }));

    await executionsApi.list({ status: 'completed' });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('status=completed');
  });

  it('get() calls GET /executions/:id', async () => {
    const execution = { id: 'exec-1', scout_id: 'scout-1', status: 'completed' };
    mockFetch.mockResolvedValue(createMockResponse({ data: execution }));

    const result = await executionsApi.get('exec-1');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.supabase.co/functions/v1/executions/exec-1',
      expect.objectContaining({ method: 'GET' })
    );
    expect(result).toEqual(execution);
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
