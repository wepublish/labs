// Supabase client for direct database access (if needed)
// Note: Most operations go through Edge Functions via api.ts

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase environment variables not configured');
}

export const supabase = createClient(SUPABASE_URL || '', SUPABASE_ANON_KEY || '', {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Set auth header for Supabase client
 * Used when direct database access is needed
 */
export function setUserId(_userId: string) {
  // For mock auth, we pass user_id via custom header
  // Edge Functions extract this from x-user-id header
  supabase.realtime.setAuth(null);
}
