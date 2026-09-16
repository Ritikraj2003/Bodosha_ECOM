import { describe, it, expect, vi, beforeEach } from 'vitest';

async function createLogger(
  env: Record<string, string> = {},
) {
  for (const [k, v] of Object.entries(env)) {
    vi.stubEnv(k, v);
  }
  const mod = await import('@/lib/logger');
  return mod.logger;
}

describe('Logger redaction', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('redacts sensitive keys in metadata', async () => {
    const logger = await createLogger({ LOG_LEVEL: 'info', NODE_ENV: 'production' });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logger.info('Login attempt', { email: 'test@example.com', password: 'secret123' });

    const output = JSON.parse(spy.mock.calls[0][0]);
    expect(output.meta.password).toBe('[REDACTED]');
    expect(output.meta.email).toBe('test@example.com');
    spy.mockRestore();
  });

  it('redacts underscore-sensitive keys like api_key', async () => {
    const logger = await createLogger({ LOG_LEVEL: 'info', NODE_ENV: 'production' });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logger.info('API call', { api_key: 'sk-123', access_token: 'xyz' });

    const output = JSON.parse(spy.mock.calls[0][0]);
    expect(output.meta.api_key).toBe('[REDACTED]');
    expect(output.meta.access_token).toBe('[REDACTED]');
    spy.mockRestore();
  });
});

describe('Logger log levels', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('filters out debug when level is info', async () => {
    const logger = await createLogger({ LOG_LEVEL: 'info', NODE_ENV: 'production' });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logger.info('Info message');
    logger.debug('Debug message');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('Info message');
    spy.mockRestore();
  });

  it('uses console.error for error level', async () => {
    const logger = await createLogger({ LOG_LEVEL: 'error', NODE_ENV: 'production' });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logger.error('Error occurred');

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('uses console.warn for warn level', async () => {
    const logger = await createLogger({ LOG_LEVEL: 'warn', NODE_ENV: 'production' });
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logger.warn('Warning message');

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('Logger format', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('produces valid JSON output in production', async () => {
    const logger = await createLogger({ LOG_LEVEL: 'info', NODE_ENV: 'production' });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logger.info('Test message');

    const output = JSON.parse(spy.mock.calls[0][0]);
    expect(output.timestamp).toBeDefined();
    expect(output.level).toBe('info');
    expect(output.message).toBe('Test message');
    spy.mockRestore();
  });

  it('limits deeply nested objects to depth 5', async () => {
    const logger = await createLogger({ LOG_LEVEL: 'info', NODE_ENV: 'production' });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const deep: Record<string, unknown> = {};
    let current = deep;
    for (let i = 0; i < 10; i++) {
      current.nested = {};
      current = current.nested as Record<string, unknown>;
    }
    current.value = 'too deep';

    logger.info('Deep object', deep);

    const output = JSON.parse(spy.mock.calls[0][0]);
    expect(JSON.stringify(output.meta)).toContain('maxDepth');
    spy.mockRestore();
  });
});
