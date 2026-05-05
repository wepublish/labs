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

  if (response.status === 204) {
    return undefined as T;
  }

  const result = await response.json();

  if (!response.ok) {
    const error = result as ApiError;
    throw new ApiClientError(
      error.error?.message || `HTTP ${response.status}`,
      response.status,
      error.error?.code
    );
  }

  // Unwrap if response is wrapped in { data: ... }
  return result.data !== undefined ? result.data : result;
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),

  post: <T>(endpoint: string, data?: object) =>
    request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),

  put: <T>(endpoint: string, data: object) =>
    request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  patch: <T>(endpoint: string, data: object) =>
    request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: <T = void>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
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
  run: (id: string, options?: import('./types').ScoutRunOptions) =>
    api.post<import('./types').RunResult>(`scouts/${id}/run`, options),
  test: (id: string) => api.post<import('./types').TestResult>(`scouts/${id}/test`),
};

export const unitsApi = {
  list: (params?: {
    location_city?: string;
    topic?: string;
    scout_id?: string;
    unused_only?: boolean;
    limit?: number;
    date_from?: string;
    date_to?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.location_city) searchParams.set('location_city', params.location_city);
    if (params?.topic) searchParams.set('topic', params.topic);
    if (params?.scout_id) searchParams.set('scout_id', params.scout_id);
    if (params?.unused_only !== undefined) searchParams.set('unused_only', String(params.unused_only));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.date_from) searchParams.set('date_from', params.date_from);
    if (params?.date_to) searchParams.set('date_to', params.date_to);
    return api.get<import('./types').InformationUnit[]>(`units?${searchParams}`);
  },
  locations: () => api.get<import('./types').Location[]>('units/locations'),
  search: (query: string, params?: {
    location_city?: string;
    topic?: string;
    scout_id?: string;
    min_similarity?: number;
  }) => {
    const searchParams = new URLSearchParams({ q: query });
    if (params?.location_city) searchParams.set('location_city', params.location_city);
    if (params?.topic) searchParams.set('topic', params.topic);
    if (params?.scout_id) searchParams.set('scout_id', params.scout_id);
    if (params?.min_similarity) searchParams.set('min_similarity', String(params.min_similarity));
    return api.get<import('./types').InformationUnit[]>(`units/search?${searchParams}`);
  },
  markUsed: (unitIds: string[]) =>
    api.patch<{ marked_count: number }>('units/mark-used', { unit_ids: unitIds }),
  delete: (id: string) => api.delete(`units/${id}`),
};

export const manualUploadApi = {
  submitText: (data: {
    text: string;
    location?: import('./types').Location | null;
    topic?: string | null;
    source_title?: string | null;
    source_url?: string | null;
    publication_date: string;
  }) =>
    api.post<import('./types').NewspaperProcessingResult>('manual-upload', {
      content_type: 'text_extract',
      ...data,
    }),

  requestUploadUrl: (data: {
    content_type: 'photo' | 'pdf';
    file_name: string;
    file_size: number;
    mime_type: string;
  }) =>
    api.post<import('./types').PresignedUploadResult>('manual-upload', data),

  confirmUpload: (data: {
    content_type: 'photo_confirm' | 'pdf_confirm';
    storage_path: string;
    description?: string;
    location?: import('./types').Location | null;
    topic?: string | null;
    source_title?: string | null;
    source_url?: string | null;
    publication_date?: string | null;
  }) =>
    api.post<import('./types').ManualUploadResult | import('./types').NewspaperProcessingResult>('manual-upload', data),

  uploadFile: (url: string, file: File) =>
    fetch(url, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
    }),

  getJob: (jobId: string) =>
    api.get<import('./types').NewspaperJob>(`manual-upload?job=${encodeURIComponent(jobId)}`),

  recentPdfs: (limit = 5) =>
    api.get<import('./types').RecentPdfUpload[]>(`manual-upload?recent=${limit}`),

  finalizePdf: (jobId: string, selectedUids: string[]) =>
    api.post<{
      units_created: number;
      units_merged?: number;
      units_saved?: number;
      dedup_summary?: import('./types').UploadDedupDetail[];
      already_finalized?: boolean;
    }>('manual-upload', {
      content_type: 'pdf_finalize',
      job_id: jobId,
      selected_uids: selectedUids,
    }),

  cancelPdf: (jobId: string) =>
    api.post<{ status: 'cancelled' }>('manual-upload', {
      content_type: 'pdf_cancel',
      job_id: jobId,
    }),
};

export const composeApi = {
  generate: (params: {
    unit_ids: string[];
    style?: 'news' | 'summary' | 'analysis';
    max_words?: number;
    include_sources?: boolean;
    custom_system_prompt?: string;
    /** When set, the server drops units not matching and tells the LLM to stay
     *  on-topic for this village. */
    village_id?: string;
    village_name?: string;
  }) => api.post<import('./types').Draft>('compose/generate', params),
};

export const settingsApi = {
  getSelectPrompt: () => api.get<{ prompt: string }>('bajour-select-units'),
  putSelectPrompt: (content: string) =>
    api.put<{ prompt: string }>('bajour-select-units', { content }),
  resetSelectPrompt: () => api.delete<{ prompt: string }>('bajour-select-units'),
  getComposePrompt: () => api.get<{ prompt: string }>('compose/prompt'),
  putComposePrompt: (content: string) =>
    api.put<{ prompt: string }>('compose/prompt', { content }),
  resetComposePrompt: () => api.delete<{ prompt: string }>('compose/prompt'),
  getMaxUnits: () => api.get<{ value: number }>('compose/max-units'),
  putMaxUnits: (value: number) =>
    api.put<{ value: number }>('compose/max-units', { value }),
  resetMaxUnits: () => api.delete<{ value: number }>('compose/max-units'),
};

export const civicApi = {
  discover: (root_domain: string) =>
    api.post<import('./types').CandidateUrl[]>('civic-discover', { root_domain }),
  test: (tracked_urls: string[], criteria?: string) =>
    api.post<import('./types').CivicTestResult>('civic-test', { tracked_urls, criteria }),
  promises: {
    list: (scout_id: string) =>
      api.get<import('./types').Promise[]>(`civic-promises?scout_id=${scout_id}`),
    updateStatus: (id: string, status: string) =>
      api.patch<import('./types').Promise>(`civic-promises/${id}`, { status }),
  },
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
