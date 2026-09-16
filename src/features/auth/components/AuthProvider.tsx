'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/features/auth/store';
import { createClient } from '@/infrastructure/supabase/client';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize);
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    // Check if recovery tokens are in URL hash or search params on load
    if (typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      const isRecovery = hash.includes('type=recovery') || search.includes('type=recovery');

      if (isRecovery && !window.location.pathname.startsWith('/auth/reset-password')) {
        window.location.href = `/auth/reset-password${search}${hash}`;
        return;
      }
    }

    initialize();

    try {
      const supabase = createClient();
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') {
          if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth/reset-password')) {
            window.location.href = `/auth/reset-password${window.location.search}${window.location.hash}`;
          }
          return;
        }

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          useAuthStore.getState().initialize();
        }
        if (event === 'SIGNED_OUT') {
          setUser(null);
        }
      });
      return () => subscription?.unsubscribe();
    } catch {
      // Supabase may not be configured; ignore
    }
  }, [initialize, setUser]);

  return <>{children}</>;
}
