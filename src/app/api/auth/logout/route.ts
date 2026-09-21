import { NextResponse } from 'next/server';
import { clearSessionCookie, AUTH_COOKIE_NAME } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await clearSessionCookie();
    const response = NextResponse.json({ success: true });
    try {
      response.cookies.delete(AUTH_COOKIE_NAME);
    } catch {}
    response.cookies.set(AUTH_COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      expires: new Date(0),
      path: '/',
    });
    return response;
  } catch (error) {
    console.error('Logout route error:', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
