// coJournalist-Lite Auth Store
// Extends Labs shared auth pattern with mock user support

import { auth as sharedAuth } from '@shared/stores/auth';
import { get } from 'svelte/store';

// Re-export shared auth store
export const auth = sharedAuth;

/**
 * Initialize authentication
 * Priority: URL token > localStorage session > iframe error > login page
 */
export function initAuth(urlToken?: string | null, inIframe: boolean = false) {
  const token = urlToken?.trim();

  // Priority 1: URL token (iframe embedding from CMS)
  if (token) {
    localStorage.setItem('dev_user_id', token);

    // Strip token from URL for security (browser history, Referer headers)
    if (typeof window !== 'undefined' && window.location) {
      const currentParams = new URLSearchParams(window.location.search);
      if (currentParams.has('token')) {
        currentParams.delete('token');
        const newSearch = currentParams.toString();
        const cleanUrl = window.location.pathname +
          (newSearch ? `?${newSearch}` : '') +
          window.location.hash;
        history.replaceState(null, '', cleanUrl);
      }
    }

    sharedAuth.mockAuth({
      sub: token,
      email: `${token}@wepublish.ch`,
      name: `CMS Benutzer (${token.slice(0, 8)}...)`,
      roles: ['user'],
    });
    return;
  }

  // Priority 2: Existing localStorage session
  const existingUserId = localStorage.getItem('dev_user_id');
  if (existingUserId) {
    sharedAuth.mockAuth({
      sub: existingUserId,
      email: `${existingUserId}@test.local`,
      name: `Test Benutzer (${existingUserId})`,
      roles: ['user'],
    });
    return;
  }

  // Priority 3: In iframe without token = error
  if (inIframe) {
    sharedAuth.setError('Kein Token gefunden. Bitte über das CMS zugreifen.');
    return;
  }

  // Priority 4: Not in iframe = show login page (local dev)
  sharedAuth.setLoading(false);
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
