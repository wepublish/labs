/**
 * Supabase client configuration.
 *
 * IMPORTANT: Row Level Security (RLS) must be enabled on all tables.
 * The anon key provides no direct access - all access is controlled by RLS policies.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[supabase] Missing configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

/**
 * Supabase client instance.
 *
 * Use this for all database operations. RLS policies will automatically
 * filter data based on the authenticated user.
 */
export const supabase: SupabaseClient = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    // We use external JWT auth, not Supabase Auth
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  }
});

/**
 * Set the auth token for authenticated requests.
 *
 * Call this after verifying the JWT from the parent iframe.
 * The token will be included in the Authorization header for all subsequent requests.
 *
 * @param token - The verified JWT token
 */
export function setAuthToken(token: string): void {
  // Set the token in the global headers
  // This will be sent with all requests to Supabase
  supabase.auth.setSession({
    access_token: token,
    refresh_token: '' // Not used with external JWT
  });
}

/**
 * Clear the auth token.
 *
 * Call this on logout or token expiration.
 */
export function clearAuthToken(): void {
  supabase.auth.signOut();
}

/**
 * Check if Supabase is configured.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}
