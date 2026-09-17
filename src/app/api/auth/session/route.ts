import { NextResponse } from 'next/server';
import { getAuthSession } from '@/features/auth/actions/credentials';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { user } = await getAuthSession();
    return NextResponse.json(
      { user },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (e) {
    console.error('Session API error:', e);
    return NextResponse.json({ user: null });
  }
}
