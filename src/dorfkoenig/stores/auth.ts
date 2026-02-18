// coJournalist-Lite Auth Store
// Extends Labs shared auth pattern with mock user support

import { auth as sharedAuth } from '@shared/stores/auth';
import { get } from 'svelte/store';

// Re-export shared auth store
export const auth = sharedAuth;

/**
 * Initialize authentication
 * Checks for existing mock user session in localStorage
 */
export function initAuth() {
  const existingUserId = localStorage.getItem('dev_user_id');

  if (existingUserId) {
    sharedAuth.mockAuth({
      sub: existingUserId,
      email: `${existingUserId}@test.local`,
      name: `Test Benutzer (${existingUserId})`,
      roles: ['user'],
    });
  } else {
    // Not logged in - auth store will show loading=false, user=null
    sharedAuth.setLoading(false);
  }
}

/**
 * Login with mock user ID
 */
export function login(userId: string) {
  const trimmedId = userId.trim();
  if (!trimmedId) {
    throw new Error('Benutzer-ID erforderlich');
  }

  localStorage.setItem('dev_user_id', trimmedId);
  sharedAuth.mockAuth({
    sub: trimmedId,
    email: `${trimmedId}@test.local`,
    name: `Test Benutzer (${trimmedId})`,
    roles: ['user'],
  });
}

/**
 * Logout - clear session
 */
export function logout() {
  localStorage.removeItem('dev_user_id');
  sharedAuth.clear();
}

/**
 * Get current user ID
 * Returns null if not authenticated
 */
export function getUserId(): string | null {
  const state = get(sharedAuth);
  return state.user?.id ?? null;
}

/**
 * Get current user
 */
export function getUser() {
  return get(sharedAuth).user;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  const state = get(sharedAuth);
  return !state.loading && state.user !== null;
}
