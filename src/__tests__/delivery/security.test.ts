import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  signQrToken,
  verifyQrToken,
  generateDeliveryOtp,
  hashDeliveryOtp,
  isQrConfigured,
  DELIVERY_OTP_MAX_ATTEMPTS,
} from '@/features/delivery/lib/security';

const TEST_SECRET = 'test-secret-1234567890';

beforeEach(() => {
  process.env.DELIVERY_QR_SECRET = TEST_SECRET;
});

afterEach(() => {
  delete process.env.DELIVERY_QR_SECRET;
});

describe('delivery QR tokens', () => {
  it('signs and verifies a token', () => {
    const token = signQrToken('DD-X7K2L9P');
    const result = verifyQrToken(token);
    expect(result?.trackingCode).toBe('DD-X7K2L9P');
    expect(result?.expiresAt).toBeGreaterThan(Date.now());
  });

  it('rejects a tampered token', () => {
    const token = signQrToken('DD-X7K2L9P');
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    expect(verifyQrToken(tampered)).toBeNull();
  });

  it('rejects a token with a different payload', () => {
    const token = signQrToken('DD-X7K2L9P');
    const [payload] = token.split('.');
    const other = signQrToken('DD-AAAAAAA');
    const [, sig] = other.split('.');
    expect(verifyQrToken(`${payload}.${sig}`)).toBeNull();
  });

  it('rejects an expired token', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = signQrToken('DD-X7K2L9P');
    vi.setSystemTime(new Date('2026-01-01T00:35:00Z'));
    expect(verifyQrToken(token)).toBeNull();
    vi.useRealTimers();
  });

  it('keeps tokens valid for the 30-minute window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = signQrToken('DD-X7K2L9P');
    vi.setSystemTime(new Date('2026-01-01T00:25:00Z'));
    expect(verifyQrToken(token)?.trackingCode).toBe('DD-X7K2L9P');
    vi.setSystemTime(new Date('2026-01-01T00:31:00Z'));
    expect(verifyQrToken(token)).toBeNull();
    vi.useRealTimers();
  });

  it('rejects garbage input', () => {
    expect(verifyQrToken('')).toBeNull();
    expect(verifyQrToken('no-dots-here')).toBeNull();
    expect(verifyQrToken('abc.def')).toBeNull();
  });

  it('reports configuration state', () => {
    expect(isQrConfigured()).toBe(true);
    delete process.env.DELIVERY_QR_SECRET;
    process.env.NODE_ENV = 'test';
    expect(isQrConfigured()).toBe(true);
  });
});

describe('delivery OTP', () => {
  it('generates a 6-digit numeric OTP', () => {
    for (let i = 0; i < 50; i++) {
      const otp = generateDeliveryOtp();
      expect(otp).toMatch(/^\d{6}$/);
    }
  });

  it('hashes deterministically', () => {
    expect(hashDeliveryOtp('123456')).toBe(hashDeliveryOtp('123456'));
    expect(hashDeliveryOtp('123456')).not.toBe(hashDeliveryOtp('654321'));
    expect(hashDeliveryOtp('123456')).toHaveLength(64);
  });

  it('exposes the attempt limit used by actions', () => {
    expect(DELIVERY_OTP_MAX_ATTEMPTS).toBe(3);
  });
});

describe('delivery OTP email', () => {
  it('sends the OTP to the customer email and includes the tracking code', async () => {
    const { sendDeliveryOtpEmail } = await import('@/lib/email');
    process.env.NODE_ENV = 'development';
    process.env.SMTP_HOST = '';
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const sent = await sendDeliveryOtpEmail('student@cit.ac.in', '482913', 'DD-X7K2L9P');
    expect(sent).toBe(true);
    const logged = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).toContain('student@cit.ac.in');
    expect(logged).toContain('482913');
    expect(logged).toContain('DD-X7K2L9P');
    consoleSpy.mockRestore();
  });

  it('returns false when there is no recipient', async () => {
    const { sendDeliveryOtpEmail } = await import('@/lib/email');
    process.env.NODE_ENV = 'development';
    process.env.SMTP_HOST = '';
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const sent = await sendDeliveryOtpEmail('', '482913', 'DD-X7K2L9P');
    expect(sent).toBe(false);
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
