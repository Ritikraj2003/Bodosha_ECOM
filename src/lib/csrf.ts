import { NextRequest, NextResponse } from 'next/server';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function validateCsrf(request: NextRequest): { valid: boolean; reason?: string } {
  if (SAFE_METHODS.has(request.method)) {
    return { valid: true };
  }

  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  if (!origin) {
    return { valid: false, reason: 'Missing Origin header' };
  }

  try {
    const originUrl = new URL(origin);
    if (originUrl.host !== host && !originUrl.host.endsWith('.' + host)) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (appUrl) {
        const allowed = new URL(appUrl);
        if (originUrl.host === allowed.host || originUrl.host.endsWith('.' + allowed.host)) {
          return { valid: true };
        }
      }
      return { valid: false, reason: `Origin ${origin} not allowed` };
    }
  } catch {
    return { valid: false, reason: 'Invalid Origin header' };
  }

  return { valid: true };
}

export function csrfGuard(request: NextRequest): NextResponse | null {
  const result = validateCsrf(request);
  if (!result.valid) {
    return NextResponse.json(
      { error: 'CSRF validation failed', detail: result.reason },
      { status: 403 },
    );
  }
  return null;
}
