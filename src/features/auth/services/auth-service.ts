import { createClient } from '@/infrastructure/supabase/client';
import type { AuthUser, Role } from '../types';

function mapUser(data: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }): AuthUser {
  return {
    id: data.id,
    email: data.email ?? '',
    fullName: (data.user_metadata?.full_name as string) ?? data.email?.split('@')[0] ?? 'User',
    role: (data.user_metadata?.role as Role) ?? null,
    avatarUrl: (data.user_metadata?.avatar_url as string) ?? null,
    phone: (data.user_metadata?.phone as string) ?? null,
  };
}

export const authService = {
  async signUp(email: string, password: string, fullName: string, phone?: string) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, phone: phone ?? '' } },
    });
    if (error) return { user: null, error: error.message };
    return { user: data.user ? mapUser(data.user) : null, error: null };
  },

  async signIn(email: string, password: string) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { user: null, error: error.message };
    return { user: data.user ? mapUser(data.user) : null, error: null };
  },

  async signOut(): Promise<{ error: string | null }> {
    try {
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        const getReg = async () => {
          try {
            return await navigator.serviceWorker.getRegistration();
          } catch {
            return undefined;
          }
        };
        const timeout = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 600));
        const reg = await Promise.race([getReg(), timeout]);
        if (reg?.pushManager) {
          const sub = await reg.pushManager.getSubscription().catch(() => null);
          if (sub?.endpoint) {
            const { removePushSubscription } = await import('@/features/notifications/actions/push');
            await removePushSubscription(sub.endpoint).catch(() => null);
          }
        }
      }
    } catch (e) {
      console.warn('Error clearing push subscription on signOut:', e);
    }

    try {
      if (typeof window !== 'undefined') {
        await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store' }).catch(() => null);
      }
    } catch (e) {
      console.warn('API logout error:', e);
    }

    try {
      const { logoutAction } = await import('@/features/auth/actions/credentials');
      await logoutAction().catch(() => null);
    } catch (e) {
      console.warn('logoutAction error:', e);
    }

    let signOutError: string | null = null;
    try {
      const supabase = createClient();
      if (supabase?.auth?.signOut) {
        const res = await supabase.auth.signOut();
        if (res?.error) {
          signOutError = res.error.message || 'Session error';
        }
      }
    } catch (e: any) {
      signOutError = e?.message || 'Sign out failed';
    }

    return { error: signOutError };
  },

  async getSession(): Promise<{ user: AuthUser | null }> {
    try {
      if (typeof window !== 'undefined') {
        try {
          const res = await fetch('/api/auth/session', {
            headers: { 'Cache-Control': 'no-cache' },
            cache: 'no-store',
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.user) {
              return {
                user: {
                  id: data.user.id,
                  email: data.user.email,
                  fullName: data.user.fullName || data.user.email?.split('@')[0] || 'User',
                  role: (data.user.role as Role) || null,
                  avatarUrl: data.user.avatarUrl ?? null,
                  phone: data.user.phone ?? null,
                  permissions: data.user.permissions ?? [],
                },
              };
            }
          }
        } catch {
          // ignore fetch error in non-browser/test env
        }
      }

      try {
        const { getServerSession } = await import('@/features/auth/actions');
        const res = await getServerSession();
        if (res?.user) {
          return {
            user: {
              id: res.user.id,
              email: res.user.email,
              fullName: res.user.fullName || res.user.email?.split('@')[0] || 'User',
              role: (res.user.role as Role) || null,
              avatarUrl: res.user.avatarUrl ?? null,
              phone: res.user.phone ?? null,
              permissions: (res.user as any).permissions ?? [],
            },
          };
        }
      } catch {}

      const supabase = createClient();
      if (supabase?.auth?.getUser) {
        const { data } = await supabase.auth.getUser().catch(() => ({ data: null }));
        if (data?.user) {
          return { user: mapUser(data.user) };
        }
      }
    } catch (e) {
      console.warn('getSession error:', e);
    }
    return { user: null };
  },

  async fetchProfile(userId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, phone, avatar_url, role, is_active, created_at, updated_at')
      .eq('id', userId)
      .single();
    if (error || !data) return { profile: null, error: error?.message ?? 'Profile not found' };
    return { profile: data, error: null };
  },

  async updateProfile(userId: string, updates: { full_name?: string; role?: string; phone?: string; email?: string }) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('profiles')
      .upsert({ id: userId, is_active: true, email: '', full_name: '', role: '', ...updates })
      .select('id, email, full_name, phone, avatar_url, role, is_active, created_at, updated_at')
      .single();
    if (error) return { profile: null, error: error.message };
    return { profile: data, error: null };
  },

  async updateUserMetadata(metadata: Record<string, unknown>) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.updateUser({ data: metadata });
    if (error) return { user: null, error: error.message };
    return { user: data.user ? mapUser(data.user) : null, error: null };
  },
};
