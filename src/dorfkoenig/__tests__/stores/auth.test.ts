import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writable } from 'svelte/store';

// Create a mock shared auth store with the methods the auth module uses
const mockAuthState = writable({
  user: null as { id: string; email?: string; name?: string; roles: string[] } | null,
  loading: true,
  error: null as string | null,
  token: null as string | null,
});

const mockSharedAuth = {
  subscribe: mockAuthState.subscribe,
  mockAuth: vi.fn((payload: { sub?: string; email?: string; name?: string; roles?: string[] }) => {
    mockAuthState.set({
      user: {
        id: payload.sub || 'dev-user-123',
        email: payload.email || 'dev@example.com',
        name: payload.name || 'Development User',
        roles: payload.roles || ['editor'],
      },
      loading: false,
      error: null,
      token: 'mock-token',
    });
  }),
  setLoading: vi.fn((loading: boolean) => {
    mockAuthState.update((s) => ({ ...s, loading }));
  }),
  clear: vi.fn(() => {
    mockAuthState.set({
      user: null,
      loading: true,
      error: null,
      token: null,
    });
  }),
  setUser: vi.fn(),
  setError: vi.fn(),
};

vi.mock('@shared/stores/auth', () => ({
  auth: mockSharedAuth,
}));

const { login, logout, getUserId, initAuth } = await import('../../stores/auth');

describe('auth store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockSharedAuth.clear();
  });

  describe('login', () => {
    it('stores user ID in localStorage', () => {
      login('journalist-1');

      expect(localStorage.setItem).toHaveBeenCalledWith('dev_user_id', 'journalist-1');
    });

    it('trims whitespace from user ID', () => {
      login('  journalist-1  ');

      expect(localStorage.setItem).toHaveBeenCalledWith('dev_user_id', 'journalist-1');
      expect(mockSharedAuth.mockAuth).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'journalist-1' })
      );
    });

    it('throws on empty string', () => {
      expect(() => login('')).toThrow('Benutzer-ID erforderlich');
    });

    it('throws on whitespace-only string', () => {
      expect(() => login('   ')).toThrow('Benutzer-ID erforderlich');
    });
  });

  describe('logout', () => {
    it('clears localStorage', () => {
      login('journalist-1');
      vi.clearAllMocks();

      logout();

      expect(localStorage.removeItem).toHaveBeenCalledWith('dev_user_id');
      expect(mockSharedAuth.clear).toHaveBeenCalled();
    });
  });

  describe('getUserId', () => {
    it('returns user ID after login', () => {
      login('journalist-1');

      const userId = getUserId();
      expect(userId).toBe('journalist-1');
    });

    it('returns null when not authenticated', () => {
      mockSharedAuth.clear();
      // After clear, user is null so getUserId should return null
      expect(getUserId()).toBeNull();
    });
  });

  describe('initAuth', () => {
    it('restores session from localStorage when dev_user_id exists', () => {
      // Simulate a stored session
      localStorage.setItem('dev_user_id', 'journalist-2');
      vi.clearAllMocks();

      initAuth();

      expect(mockSharedAuth.mockAuth).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'journalist-2' })
      );
    });

    it('sets loading to false when no stored session', () => {
      // localStorage is empty (cleared in beforeEach)
      vi.clearAllMocks();

      initAuth();

      expect(mockSharedAuth.setLoading).toHaveBeenCalledWith(false);
      expect(mockSharedAuth.mockAuth).not.toHaveBeenCalled();
    });
  });
});
