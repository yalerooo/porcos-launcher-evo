import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  setUser: (user: UserProfile) => void;
  logout: () => void;
  isTokenValid: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      
      setUser: (user) => {
        const expiresAt = user.mode === 'microsoft' && user.expiresAt
          ? user.expiresAt
          : Date.now() + (365 * 24 * 60 * 60 * 1000); // 1 year for offline
        
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
      
      logout: () => {
        set({ user: null, isAuthenticated: false });
      },
      
      isTokenValid: () => {
        const state = get();
        if (!state.user) return false;
        if (state.user.mode === 'offline') return true;
        
        return state.user.expiresAt ? Date.now() < state.user.expiresAt : false;
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
