import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const SECRET_KEY = process.env.AUTH_SECRET || 'dilip-da-super-secret-key-2026-bodosha-ecom';
const encodedKey = new TextEncoder().encode(SECRET_KEY);
export const AUTH_COOKIE_NAME = 'dd_session';

export interface SessionPayload {
  userId: string;
  email: string;
  role: string;
  fullName: string;
  avatarUrl?: string | null;
  phone?: string | null;
  permissions?: string[];
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(encodedKey);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encodedKey, {
      algorithms: ['HS256'],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  try {
    cookieStore.delete(AUTH_COOKIE_NAME);
  } catch {}
  cookieStore.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    expires: new Date(0),
    path: '/',
  });
}

export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function createPasswordResetToken(email: string, userId: string): Promise<string> {
  return new SignJWT({ email, userId, purpose: 'password_reset' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(encodedKey);
}

export async function verifyPasswordResetToken(token: string): Promise<{ email: string; userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, encodedKey, {
      algorithms: ['HS256'],
    });
    if (payload.purpose !== 'password_reset' || !payload.email || !payload.userId) {
      return null;
    }
    return { email: payload.email as string, userId: payload.userId as string };
  } catch {
    return null;
  }
}

