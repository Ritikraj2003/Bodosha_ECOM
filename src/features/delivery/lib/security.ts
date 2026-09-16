import crypto from 'node:crypto';

export const DELIVERY_QR_TTL_MS = 30 * 60 * 1000;
export const DELIVERY_OTP_TTL_MS = 5 * 60 * 1000;
export const DELIVERY_OTP_MAX_ATTEMPTS = 3;

const DEV_FALLBACK_SECRET = 'dilip-da-dev-only-delivery-secret';

function qrSecret(): string {
  const secret = process.env.DELIVERY_QR_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === 'production') return '';
  return DEV_FALLBACK_SECRET;
}

export function isQrConfigured(): boolean {
  return qrSecret() !== '';
}

export function signQrToken(trackingCode: string, ttlMinutes?: number): string {
  const secret = qrSecret();
  if (!secret) throw new Error('DELIVERY_QR_SECRET is not configured');
  const ttlMs = ttlMinutes && ttlMinutes > 0 ? ttlMinutes * 60 * 1000 : DELIVERY_QR_TTL_MS;
  const exp = Date.now() + ttlMs;
  const payload = `${trackingCode}.${exp}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

export function verifyQrToken(token: string): { trackingCode: string; expiresAt: number } | null {
  const secret = qrSecret();
  if (!secret) return null;

  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;

  const decoded = Buffer.from(payload, 'base64url').toString();

  const expected = crypto.createHmac('sha256', secret).update(decoded).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(sig, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const [trackingCode, expStr] = decoded.split('.');
  const exp = Number(expStr);
  if (!trackingCode || !Number.isFinite(exp) || exp < Date.now()) return null;

  return { trackingCode, expiresAt: exp };
}

export function generateDeliveryOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashDeliveryOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
}
