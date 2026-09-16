import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return response;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  let user: { user_metadata?: Record<string, unknown> } | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Stale/invalid refresh token — clear the auth cookies so every request stops retrying
    request.cookies.getAll().forEach(({ name }) => {
      if (name.startsWith('sb-')) {
        response.cookies.set(name, '', { path: '/', maxAge: 0 });
      }
    });
  }
  const role = user?.user_metadata?.role as string | undefined;

  if (role === 'delivery') {
    const { pathname } = request.nextUrl;
    const isStorePath =
      pathname === '/' ||
      pathname === '/menu' ||
      pathname === '/cart' ||
      pathname === '/checkout' ||
      pathname === '/orders' ||
      pathname === '/favorites' ||
      pathname === '/profile' ||
      pathname.startsWith('/order/') ||
      pathname.startsWith('/restaurant/');
    if (isStorePath) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard/delivery';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)',
  ],
};
