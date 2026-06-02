import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';

// Deduplicates concurrent validateAndRefresh calls — only one network round-trip at a time
let _validationInFlight: Promise<boolean> | null = null;

export interface UserProfile {
  username: string;
  uuid: string;
  xuid?: string;
  mode: 'microsoft' | 'offline';
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  skinUrl?: string;
}

interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isValidating: boolean;
  setUser: (user: UserProfile) => void;
  updateTokens: (accessToken: string, refreshToken: string, expiresIn: number) => void;
  logout: () => void;
  isTokenValid: () => boolean;
  validateAndRefresh: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isValidating: false,

      setUser: (user) => {
        const expiresAt = user.mode === 'microsoft' && user.expiresAt
          ? user.expiresAt
          : user.mode === 'microsoft'
            ? Date.now() + (365 * 24 * 60 * 60 * 1000) // Fallback: 1 year
            : Date.now() + (365 * 24 * 60 * 60 * 1000);

        set({
          user: {
            ...user,
            expiresAt,
            skinUrl: user.mode === 'microsoft'
              ? `https://crafatar.com/avatars/${user.uuid}?size=128&overlay`
              : `https://api.dicebear.com/7.x/pixel-art/svg?seed=${user.username}&size=128`
          },
          isAuthenticated: true
        });
      },

      updateTokens: (accessToken, refreshToken, expiresIn) => {
        const state = get();
        if (!state.user) return;

        set({
          user: {
            ...state.user,
            accessToken,
            refreshToken,
            expiresAt: Date.now() + (expiresIn * 1000)
          }
        });
      },

      logout: () => {
        set({ user: null, isAuthenticated: false });
      },

      isTokenValid: () => {
        const state = get();
        if (!state.user) return false;
        if (state.user.mode === 'offline') return true;
        if (!state.user.accessToken) return false;

        // Consider token invalid if less than 1 hour until expiration
        const bufferTime = 60 * 60 * 1000;
        return state.user.expiresAt ? (Date.now() + bufferTime) < state.user.expiresAt : false;
      },

      validateAndRefresh: () => {
        // If a validation is already in-flight, reuse the same promise to avoid
        // concurrent requests that cause 429 TOO_MANY_REQUESTS from the MC auth API
        if (_validationInFlight) return _validationInFlight;

        const state = get();

        if (!state.user) return Promise.resolve(false);
        if (state.user.mode === 'offline') return Promise.resolve(true);
        if (!state.user.accessToken) return Promise.resolve(false);
        if (!state.user.refreshToken || state.user.refreshToken === 'none') return Promise.resolve(false);

        set({ isValidating: true });

        _validationInFlight = (async () => {
          try {
            const result: any = await invoke('validate_and_refresh_token', {
              accessToken: state.user!.accessToken,
              refreshToken: state.user!.refreshToken
            });

            if (result?.access_token && result?.refresh_token) {
              get().updateTokens(result.access_token, result.refresh_token, result.expires_in);
              set({ isValidating: false });
              return true;
            }

            if (result?.code === 'TOKEN_STILL_VALID') {
              set({ isValidating: false });
              return true;
            }

            set({ isValidating: false });
            return false;
          } catch (e: any) {
            set({ isValidating: false });

            if (e?.code === 'TOKEN_STILL_VALID') return true;
            if (e?.code === 'NO_REFRESH_TOKEN') return false;

            console.error('[AuthStore] Token validation failed:', e?.message ?? e);
            return false;
          } finally {
            _validationInFlight = null;
          }
        })();

        return _validationInFlight;
      }
    }),
    {
      name: 'porcos-auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
);
