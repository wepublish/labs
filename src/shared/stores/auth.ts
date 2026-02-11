/**
 * Authentication store for managing user state.
 *
 * Handles both production (iframe JWT) and development (mock user) flows.
 */

import { writable, type Readable } from 'svelte/store';
import {
  verifyToken,
  setAuthToken,
  clearAuthToken,
  requestAuthToken,
  onAuthToken,
  isInIframe,
  type JWTPayload
} from '@shared/utils';

export interface User {
  id: string;
  email?: string;
  name?: string;
  roles: string[];
}

export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  token: string | null;
}

const initialState: AuthState = {
  user: null,
  loading: true,
  error: null,
  token: null
};

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>(initialState);

  return {
    subscribe,

    /**
     * Set user from a verified JWT payload.
     */
    setUser(payload: JWTPayload, token: string): void {
      const user: User = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        roles: payload.roles || []
      };

      set({
        user,
        loading: false,
        error: null,
        token
      });

      // Set token for Supabase requests
      setAuthToken(token);
    },

    /**
     * Set error state.
     */
    setError(error: string): void {
      set({
        user: null,
        loading: false,
        error,
        token: null
      });
    },

    /**
     * Set loading state.
     */
    setLoading(loading: boolean): void {
      update((state) => ({ ...state, loading }));
    },

    /**
     * Clear auth state (logout).
     */
    clear(): void {
      set(initialState);
      clearAuthToken();
    },

    /**
     * Mock authentication for development outside iframe.
     */
    mockAuth(mockPayload: Partial<JWTPayload>): void {
      const user: User = {
        id: mockPayload.sub || 'dev-user-123',
        email: mockPayload.email || 'dev@example.com',
        name: mockPayload.name || 'Development User',
        roles: mockPayload.roles || ['editor']
      };

      set({
        user,
        loading: false,
        error: null,
        token: 'mock-token'
      });
    }
  };
}

export const auth = createAuthStore();

// Type-safe readable store for components
export const authStore: Readable<AuthState> = { subscribe: auth.subscribe };

/**
 * Initialize authentication.
 *
 * In production (iframe): Requests JWT from parent frame
 * In development (standalone): Uses mock user
 */
export function initAuth(): void {
  // Dev mode outside iframe: use mock user
  if (import.meta.env.DEV && !isInIframe()) {
    console.warn('[Auth] Running in dev mode with mock user');
    auth.mockAuth({
      sub: 'dev-user-123',
      email: 'dev@example.com',
      name: 'Development User',
      roles: ['editor']
    });
    return;
  }

  // Production iframe flow
  setupIframeAuth();
}

/**
 * Set up authentication via iframe postMessage.
 */
function setupIframeAuth(): void {
  auth.setLoading(true);

  // Handle incoming tokens
  onAuthToken(async (token: string) => {
    try {
      const payload = await verifyToken(token);
      auth.setUser(payload, token);
      console.log('[Auth] Successfully authenticated via iframe');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Token verification failed';
      console.error('[Auth] Token verification failed:', message);
      auth.setError(message);
    }
  });

  // Request token from parent
  requestAuthToken();

  // Timeout if no response
  setTimeout(() => {
    // Check if still loading after timeout
    let currentState: AuthState | undefined;
    const unsubscribe = auth.subscribe((state) => {
      currentState = state;
    });
    unsubscribe();

    if (currentState?.loading) {
      console.warn('[Auth] No response from parent frame after timeout');
      auth.setError('Authentication timeout - no response from parent');
    }
  }, 10000);
}

/**
 * Refresh authentication by requesting a new token.
 */
export function refreshAuth(): void {
  if (isInIframe()) {
    auth.setLoading(true);
    requestAuthToken();
  } else {
    console.warn('[Auth] Cannot refresh auth outside iframe in production');
  }
}
