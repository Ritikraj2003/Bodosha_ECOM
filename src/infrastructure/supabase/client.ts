import { createBrowserClient } from '@supabase/ssr';

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

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return createSafeProxy();
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
