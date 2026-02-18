// Supabase client for Edge Functions

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// Environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Create Supabase client with anon key (respects RLS)
 */
export function createAnonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Create Supabase client with service role key (bypasses RLS)
 * Use for scheduled jobs and internal operations
 */
export function createServiceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Get user ID from request headers
 * Supports both x-user-id header (mock auth) and JWT (future)
 */
export function getUserId(req: Request): string | null {
  // Check x-user-id header (mock auth)
  const userId = req.headers.get('x-user-id');
  if (userId) {
    return userId;
  }

  // TODO: Add JWT verification for production
  // const authHeader = req.headers.get('Authorization');
  // if (authHeader?.startsWith('Bearer ey')) {
  //   // Verify JWT and extract sub claim
  // }

  return null;
}

/**
 * Require user ID or throw error
 */
export function requireUserId(req: Request): string {
  const userId = getUserId(req);
  if (!userId) {
    throw new Error('Authentication required');
  }
  return userId;
}

// Database types
export interface Scout {
  id: string;
  user_id: string;
  name: string;
  url: string;
  criteria: string;
  location: Location | null;
  frequency: 'daily' | 'weekly' | 'monthly';
  is_active: boolean;
  last_run_at: string | null;
  consecutive_failures: number;
  notification_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface Location {
  city: string;
  state?: string;
  country: string;
  latitude?: number;
  longitude?: number;
}

export interface ScoutExecution {
  id: string;
  scout_id: string;
  user_id: string;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at: string | null;
  change_status: 'changed' | 'same' | 'error' | 'first_run' | null;
  criteria_matched: boolean | null;
  summary_text: string | null;
  summary_embedding: number[] | null;
  is_duplicate: boolean;
  duplicate_similarity: number | null;
  notification_sent: boolean;
  notification_error: string | null;
  error_message: string | null;
  units_extracted: number;
  scrape_duration_ms: number | null;
  created_at: string;
}

export interface InformationUnit {
  id: string;
  user_id: string;
  scout_id: string;
  execution_id: string;
  statement: string;
  unit_type: 'fact' | 'event' | 'entity_update';
  entities: string[];
  source_url: string;
  source_domain: string;
  source_title: string | null;
  location: Location | null;
  embedding: number[];
  used_in_article: boolean;
  used_at: string | null;
  created_at: string;
  expires_at: string;
}
