import { validateCsrf } from '@/lib/csrf';

function mockRequest(origin: string | null, host: string, method = 'POST') {
  return {
    method,
    headers: {
      get(name: string) {
        if (name === 'origin') return origin;
        if (name === 'host') return host;
        return null;
      },
    },
  } as unknown as Request;
}

describe('validateCsrf', () => {
  it('allows same-origin requests', () => {
    const result = validateCsrf(mockRequest('https://dilipda.com', 'dilipda.com'));
    expect(result.valid).toBe(true);
  });

  it('blocks missing origin', () => {
    const result = validateCsrf(mockRequest(null, 'dilipda.com'));
    expect(result.valid).toBe(false);
  });

  it('blocks cross-origin requests', () => {
    const result = validateCsrf(mockRequest('https://evil.com', 'dilipda.com'));
    expect(result.valid).toBe(false);
  });

  it('allows safe methods without origin check', () => {
    const result = validateCsrf(mockRequest(null, 'dilipda.com', 'GET'));
    expect(result.valid).toBe(true);
  });

  it('allows requests from NEXT_PUBLIC_APP_URL', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
    const result = validateCsrf(mockRequest('http://localhost:3000', 'localhost:3001'));
    expect(result.valid).toBe(true);
    vi.unstubAllEnvs();
  });
});
