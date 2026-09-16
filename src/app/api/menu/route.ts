import { NextResponse } from 'next/server';
import { getPublicMenu } from '@/features/menu/actions';

export const dynamic = 'force-dynamic';

export async function GET() {
  const res = await getPublicMenu();
  return NextResponse.json(res, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}
