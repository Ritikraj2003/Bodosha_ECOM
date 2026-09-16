'use client';

import { create } from 'zustand';
import type { AuthUser, SessionState } from './types';
import { authService } from './services/auth-service';

interface AuthStore extends SessionState {
  setUser: (user: AuthUser | null) => void;
  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  setUser: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),

  initialize: async () => {
    try {
      const { user } = await authService.getSession();
      set({ user, isAuthenticated: !!user, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  signOut: async () => {
    await authService.signOut();
    set({ user: null, isAuthenticated: false });
  },

  refresh: async () => {
    try {
      const { user } = await authService.getSession();
      set({ user, isAuthenticated: !!user, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
