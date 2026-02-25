// coJournalist-Lite API client

import { getUserId } from '../stores/auth';
import type { ApiError } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const userId = getUserId();
  if (!userId) {
    throw new ApiClientError('Nicht authentifiziert', 401, 'UNAUTHORIZED');
  }

  const url = `${SUPABASE_URL}/functions/v1/${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'x-user-id': userId,
      ...options.headers,
    },
  });

  // Handle no content
  if (response.status === 204) {
    return undefined as T;
  }

  // Parse response
  const result = await response.json();

  // Handle errors
  if (!response.ok) {
    const error = result as ApiError;
    throw new ApiClientError(
      error.error?.message || `HTTP ${response.status}`,
      response.status,
      error.error?.code
    );
  }

  // Return data (unwrap if wrapped in { data: ... })
  return result.data !== undefined ? result.data : result;
}

// API methods
export const api = {
  /**
   * GET request
   */
  get: <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),

  /**
   * POST request
   */
  post: <T>(endpoint: string, data?: object) =>
    request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),

  /**
   * PUT request
   */
  put: <T>(endpoint: string, data: object) =>
    request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  /**
   * PATCH request
   */
  patch: <T>(endpoint: string, data: object) =>
    request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  /**
   * DELETE request
   */
  delete: (endpoint: string) => request<void>(endpoint, { method: 'DELETE' }),
};

// Type-safe API helpers
export const scoutsApi = {
  list: () => api.get<import('./types').Scout[]>('scouts'),
  get: (id: string) => api.get<import('./types').Scout>(`scouts/${id}`),
  create: (data: import('./types').ScoutCreateInput) =>
    api.post<import('./types').Scout>('scouts', data),
  update: (id: string, data: import('./types').ScoutUpdateInput) =>
    api.put<import('./types').Scout>(`scouts/${id}`, data),
  delete: (id: string) => api.delete(`scouts/${id}`),
  run: (id: string, options?: { skip_notification?: boolean; extract_units?: boolean }) =>
    api.post<import('./types').RunResult>(`scouts/${id}/run`, options),
  test: (id: string) => api.post<import('./types').TestResult>(`scouts/${id}/test`),
};

export const unitsApi = {
  list: (params?: { location_city?: string; topic?: string; unused_only?: boolean; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.location_city) searchParams.set('location_city', params.location_city);
    if (params?.topic) searchParams.set('topic', params.topic);
    if (params?.unused_only !== undefined) searchParams.set('unused_only', String(params.unused_only));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    return api.get<import('./types').InformationUnit[]>(`units?${searchParams}`);
  },
  locations: () => api.get<import('./types').Location[]>('units/locations'),
  search: (query: string, params?: { location_city?: string; topic?: string; min_similarity?: number }) => {
    const searchParams = new URLSearchParams({ q: query });
    if (params?.location_city) searchParams.set('location_city', params.location_city);
    if (params?.topic) searchParams.set('topic', params.topic);
    if (params?.min_similarity) searchParams.set('min_similarity', String(params.min_similarity));
    return api.get<import('./types').InformationUnit[]>(`units/search?${searchParams}`);
  },
  markUsed: (unitIds: string[]) =>
    api.patch<{ marked_count: number }>('units/mark-used', { unit_ids: unitIds }),
};

export const composeApi = {
  generate: (params: {
    unit_ids: string[];
    style?: 'news' | 'summary' | 'analysis';
    max_words?: number;
    include_sources?: boolean;
    custom_system_prompt?: string;
  }) => api.post<import('./types').Draft>('compose/generate', params),
};

export const executionsApi = {
  list: (params?: { scout_id?: string; status?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.scout_id) searchParams.set('scout_id', params.scout_id);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    return api.get<import('./types').Execution[]>(`executions?${searchParams}`);
  },
  get: (id: string) => api.get<import('./types').Execution>(`executions/${id}`),
};
