// Supabase client
export { supabase, setAuthToken, clearAuthToken, isSupabaseConfigured } from './supabase';

// JWT verification
export { verifyToken, isTokenExpired, clearKeyCache, type JWTPayload } from './jwt';

// iframe communication
export {
  requestAuthToken,
  onAuthToken,
  isInIframe,
  cleanup as cleanupIframeBridge,
  type AuthMessage,
  type MessageHandler
} from './iframe-bridge';
