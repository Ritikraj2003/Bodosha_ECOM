import { createClient } from '@supabase/supabase-js';
import { env } from '@/config/env';

function createSafeProxy(): any {
  const handler: ProxyHandler<any> = {
    get: (_target, prop) => {
      if (prop === 'then') {
        return (resolve: (val: any) => void) =>
          resolve({ data: [], error: null, count: 0, user: null, users: [] });
      }
      return new Proxy(() => {}, handler);
    },
    apply: () => new Proxy(() => {}, handler),
  };
  return new Proxy(() => {}, handler);
}

export function createAdminClient() {
  if (!env.supabase.serviceRoleKey || !env.supabase.url) {
    return createSafeProxy();
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
