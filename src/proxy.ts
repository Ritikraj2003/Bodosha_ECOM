import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SECRET_KEY = process.env.AUTH_SECRET || 'dilip-da-super-secret-key-2026-bodosha-ecom';
const encodedKey = new TextEncoder().encode(SECRET_KEY);
const AUTH_COOKIE_NAME = 'dd_session';

interface SessionPayload {
  userId: string;
  email: string;
  role: string;
  fullName: string;
  permissions?: string[];
}

async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encodedKey, {
      algorithms: ['HS256'],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;
  const role = session?.role?.toLowerCase() || '';

  const isPublicRoute =
    pathname === '/' ||
    pathname === '/browser' ||
    pathname === '/menu' ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/uploads');

  const isProtectedRoute =
    pathname === '/profile' ||
    pathname === '/cart' ||
    pathname === '/checkout' ||
    pathname.startsWith('/orders') ||
    pathname.startsWith('/order/') ||
    pathname.startsWith('/favorites') ||
    pathname.startsWith('/home') ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/student') ||
    pathname.startsWith('/wallet') ||
    pathname.startsWith('/delivery');

  // 1. Unauthenticated (Logged out) User Handling
  if (!session) {
    if (isProtectedRoute) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/auth/login';
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // 2. Authenticated User trying to access Login/Signup -> redirect to their home
  if (pathname === '/auth/login' || pathname === '/auth/signup') {
    const homeUrl = request.nextUrl.clone();
    homeUrl.search = '';
    if (['admin', 'super_admin', 'owner', 'employee', 'staff', 'manager'].includes(role)) {
      homeUrl.pathname = '/dashboard/admin';
    } else if (role === 'delivery') {
      homeUrl.pathname = '/dashboard/delivery';
    } else {
      homeUrl.pathname = '/home/student';
    }
    return NextResponse.redirect(homeUrl);
  }

  // 3. Admin / Staff Portal Routing
  const isAdminRole = ['admin', 'super_admin', 'owner', 'employee', 'staff', 'manager'].includes(role);
  if (isAdminRole) {
    // If admin visits generic /profile, redirect to /admin/profile
    if (pathname === '/profile') {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/profile';
      return NextResponse.redirect(url);
    }
    // If admin visits /admin or /admin/dashboard, redirect to /dashboard/admin
    if (pathname === '/admin' || pathname === '/admin/dashboard') {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard/admin';
      return NextResponse.redirect(url);
    }
    // Block admin from accessing student/customer or delivery pages → redirect to admin dashboard
    if (
      pathname.startsWith('/student') ||
      pathname.startsWith('/home/student') ||
      pathname === '/home' ||
      pathname.startsWith('/delivery') ||
      pathname.startsWith('/dashboard/delivery') ||
      pathname.startsWith('/dashboard/student') ||
      pathname.startsWith('/favorites') ||
      pathname.startsWith('/wallet')
    ) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard/admin';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  // 4. Delivery Partner Portal Routing
  if (role === 'delivery') {
    const isCustomerStorePath =
      pathname === '/' ||
      pathname === '/browser' ||
      pathname === '/home' ||
      pathname.startsWith('/home/') ||
      pathname === '/menu' ||
      pathname === '/cart' ||
      pathname === '/checkout' ||
      pathname === '/orders' ||
      pathname.startsWith('/favorites') ||
      pathname.startsWith('/dashboard/student') ||
      pathname.startsWith('/wallet') ||
      pathname === '/profile';

    if (isCustomerStorePath) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard/delivery';
      url.search = '';
      return NextResponse.redirect(url);
    }

    if (pathname === '/delivery' || pathname === '/delivery/dashboard') {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard/delivery';
      return NextResponse.redirect(url);
    }

    if (pathname === '/delivery/profile') {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard/delivery/profile';
      return NextResponse.redirect(url);
    }

    // Disallow delivery from accessing admin dashboard
    if (pathname.startsWith('/admin') || pathname.startsWith('/dashboard/admin')) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard/delivery';
      return NextResponse.redirect(url);
    }
  }

  // 5. Student / Customer Portal Routing
  if (role === 'student' || role === 'customer') {
    // Root / /home / /student → /home/student
    if (pathname === '/' || pathname === '/home' || pathname === '/student') {
      const url = request.nextUrl.clone();
      url.pathname = '/home/student';
      return NextResponse.redirect(url);
    }

    // /menu → /student/menu
    if (pathname === '/menu') {
      const url = request.nextUrl.clone();
      url.pathname = '/student/menu';
      return NextResponse.redirect(url);
    }

    // /cart → /student/cart
    if (pathname === '/cart') {
      const url = request.nextUrl.clone();
      url.pathname = '/student/cart';
      return NextResponse.redirect(url);
    }

    // /orders → /student/orders
    if (pathname === '/orders') {
      const url = request.nextUrl.clone();
      url.pathname = '/student/orders';
      return NextResponse.redirect(url);
    }

    // /orders/[id] → /student/orders/[id]
    if (pathname.startsWith('/orders/')) {
      const url = request.nextUrl.clone();
      url.pathname = `/student${pathname}`;
      return NextResponse.redirect(url);
    }

    // /profile → /student/profile
    if (pathname === '/profile') {
      const url = request.nextUrl.clone();
      url.pathname = '/student/profile';
      return NextResponse.redirect(url);
    }

    // /favorites → /student/favorites
    if (pathname === '/favorites') {
      const url = request.nextUrl.clone();
      url.pathname = '/student/favorites';
      return NextResponse.redirect(url);
    }

    // /dashboard/student/* → keep as-is (student wallet etc.)
    // /wallet → /dashboard/student/wallet
    if (pathname === '/wallet') {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard/student/wallet';
      return NextResponse.redirect(url);
    }

    // Disallow student from accessing admin or delivery dashboards
    if (
      pathname.startsWith('/admin') ||
      pathname.startsWith('/dashboard/admin') ||
      pathname.startsWith('/delivery') ||
      pathname.startsWith('/dashboard/delivery')
    ) {
      const url = request.nextUrl.clone();
      url.pathname = '/home/student';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();

}


export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)',
  ],
};
