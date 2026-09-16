import { rateLimit, resetRateLimit, RATE_LIMIT_CONFIGS, rateLimitKey } from '@/lib/rate-limit';

describe('rateLimit', () => {
  afterEach(async () => {
    await resetRateLimit('test:clear');
  });

  it('allows requests within limit', async () => {
    const key = rateLimitKey('test', 'user-1');
    const result = await rateLimit(key, RATE_LIMIT_CONFIGS.relaxed);
    expect(result.success).toBe(true);
    expect(result.remaining).toBeGreaterThan(0);
  });

  it('blocks requests over limit', async () => {
    const key = rateLimitKey('test', 'user-2');
    const config = { interval: 60_000, maxRequests: 3 };

    for (let i = 0; i < 3; i++) {
      const result = await rateLimit(key, config);
      expect(result.success).toBe(true);
    }

    const blocked = await rateLimit(key, config);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('returns remaining count', async () => {
    const key = rateLimitKey('test', 'user-3');
    const config = { interval: 60_000, maxRequests: 5 };

    const r1 = await rateLimit(key, config);
    expect(r1.remaining).toBe(4);

    const r2 = await rateLimit(key, config);
    expect(r2.remaining).toBe(3);
  });

  it('generates unique keys per prefix and identifier', () => {
    const k1 = rateLimitKey('auth', 'ip-1');
    const k2 = rateLimitKey('auth', 'ip-2');
    const k3 = rateLimitKey('dashboard', 'ip-1');
    expect(k1).not.toBe(k2);
    expect(k1).not.toBe(k3);
    expect(k1).toContain('auth');
    expect(k1).toContain('ip-1');
  });
});
