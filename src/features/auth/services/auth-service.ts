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
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub?.endpoint) {
          const { removePushSubscription } = await import('@/features/notifications/actions/push');
          await removePushSubscription(sub.endpoint);
        }
      }
    } catch (e) {
      console.warn('Error clearing push subscription on signOut:', e);
    }
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    return { error: error?.message ?? null };
  },

  async getSession(): Promise<{ user: AuthUser | null }> {
    const supabase = createClient();
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return { user: null };
      const user = mapUser(data.user);
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('phone, full_name, role, avatar_url')
          .eq('id', user.id)
          .maybeSingle();
        if (profile) {
          if (profile.phone) user.phone = profile.phone;
          if (profile.full_name) user.fullName = profile.full_name;
          if (profile.role) user.role = profile.role as Role;
          if (profile.avatar_url) user.avatarUrl = profile.avatar_url;
        }
      } catch {}
      return { user };
    } catch {
      // Invalid/expired refresh token — clear the stale local session
      await supabase.auth.signOut({ scope: 'local' }).catch(() => null);
      return { user: null };
    }
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
