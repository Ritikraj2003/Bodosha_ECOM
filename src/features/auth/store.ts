'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthUser, SessionState } from './types';
import { authService } from './services/auth-service';

interface AuthStore extends SessionState {
  setUser: (user: AuthUser | null) => void;
  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

let initPromise: Promise<void> | null = null;

const dummyStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: true,
      isAuthenticated: false,

      setUser: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),

      initialize: async () => {
        const current = get();
        if (current.user) {
          set({ isLoading: false, isAuthenticated: true });
          return;
        }

        if (initPromise) return initPromise;
        initPromise = (async () => {
          try {
            const { user } = await authService.getSession();
            set({ user, isAuthenticated: !!user, isLoading: false });
          } catch {
            set({ user: null, isAuthenticated: false, isLoading: false });
          } finally {
            initPromise = null;
          }
        })();
        return initPromise;
      },

      signOut: async () => {
        await authService.signOut();
        set({ user: null, isAuthenticated: false, isLoading: false });
        if (typeof window !== 'undefined') {
          try {
            window.sessionStorage.removeItem('bodosa-auth');
          } catch {}
        }
      },

      refresh: async () => {
        try {
          const { user } = await authService.getSession();
          set({ user, isAuthenticated: !!user, isLoading: false });
        } catch {
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },
    }),
    {
      name: 'bodosa-auth',
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? window.sessionStorage : dummyStorage)),
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isLoading = false;
        }
      },
    }
  )
);
