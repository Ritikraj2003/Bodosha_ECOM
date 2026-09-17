import { createClient } from '@supabase/supabase-js';

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

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return createSafeProxy();
  return createClient(url, key, {
    global: {
      fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }),
    },
  });
}
