import { createClient } from '@supabase/supabase-js';
import { env } from '@/config/env';

export function createAdminClient() {
  if (!env.supabase.serviceRoleKey) {
    throw new Error(
      'Supabase service role key not configured. Set SUPABASE_SERVICE_ROLE_KEY in .env.local',
    );
  }

  return createClient(env.supabase.url!, env.supabase.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }),
    },
  });
}
