import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';

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

      validateAndRefresh: async () => {
        const state = get();
        console.log('[AuthStore] validateAndRefresh called');
        console.log('[AuthStore] User mode:', state.user?.mode);
        console.log('[AuthStore] Has accessToken:', !!state.user?.accessToken);
        console.log('[AuthStore] Has refreshToken:', !!state.user?.refreshToken);
        console.log('[AuthStore] refreshToken (first 30 chars):', state.user?.refreshToken?.substring(0, 30));
        console.log('[AuthStore] refreshToken === "managed_by_xal"?', state.user?.refreshToken === 'managed_by_xal');
        console.log('[AuthStore] expiresAt:', state.user?.expiresAt);
        console.log('[AuthStore] Current time:', Date.now());
        console.log('[AuthStore] Time until expiry (hours):', state.user?.expiresAt ? ((state.user.expiresAt - Date.now()) / 3600000).toFixed(2) : 'N/A');

        if (!state.user) {
          console.log('[AuthStore] No user, returning false');
          return false;
        }
        if (state.user.mode === 'offline') {
          console.log('[AuthStore] Offline mode, returning true');
          return true;
        }
        if (!state.user.accessToken) {
          console.log('[AuthStore] No accessToken, returning false');
          return false;
        }

        // Check if refresh token is usable (managed_by_xal is normal for Microsoft accounts)
        if (!state.user.refreshToken || state.user.refreshToken === 'none') {
          console.log('[AuthStore] refreshToken is not usable (empty/none), returning false');
          return false;
        }

        set({ isValidating: true });

        try {
          console.log('[AuthStore] Calling Rust command validate_and_refresh_token...');
          console.log('[AuthStore] accessToken (first 30 chars):', state.user.accessToken.substring(0, 30));
          console.log('[AuthStore] refreshToken (first 30 chars):', state.user.refreshToken.substring(0, 30));

          const result: any = await invoke('validate_and_refresh_token', {
            accessToken: state.user.accessToken,
            refreshToken: state.user.refreshToken
          });

          console.log('[AuthStore] validate_and_refresh_token result:', result);
          console.log('[AuthStore] result.code:', result?.code);

          if (result?.access_token && result?.refresh_token) {
            console.log('[AuthStore] Got new tokens, updating...');
            get().updateTokens(
              result.access_token,
              result.refresh_token,
              result.expires_in
            );
            set({ isValidating: false });
            console.log('[AuthStore] Tokens updated successfully');
            return true;
          }

          if (result?.code === 'TOKEN_STILL_VALID') {
            console.log('[AuthStore] Server says token is still valid');
            set({ isValidating: false });
            return true;
          }

          set({ isValidating: false });
          console.log('[AuthStore] No new tokens, returning false');
          return false;
        } catch (e: any) {
          console.log('[AuthStore] validate_and_refresh_token threw error:', e);
          console.log('[AuthStore] Error code:', e?.code);
          console.log('[AuthStore] Error message:', e?.message);
          set({ isValidating: false });

          // If error code is TOKEN_STILL_VALID, the token is fine
          if (e?.code === 'TOKEN_STILL_VALID') {
            console.log('[AuthStore] TOKEN_STILL_VALID, returning true');
            return true;
          }

          // If error code is NO_REFRESH_TOKEN, we cannot refresh
          if (e?.code === 'NO_REFRESH_TOKEN') {
            console.log('[AuthStore] NO_REFRESH_TOKEN, returning false');
            return false;
          }

          // Other errors - log and return false
          console.error('[AuthStore] Unexpected error during validation:', e);
          return false;
        }
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
