const SENSITIVE_KEYS = new Set([
  'password', 'token', 'secret', 'key', 'authorization', 'cookie',
  'session', 'jwt', 'accesstoken', 'refreshtoken', 'apikey',
  'gatewaypaymentid', 'gatewaysignature', 'gatewayorderid',
  'razorpaypaymentid', 'razorpayorderid', 'razorpaysignature',
]);

function redact(obj: unknown, depth = 0): unknown {
  if (depth > 5) return '[maxDepth]';
  if (typeof obj === 'string') return obj;
  if (typeof obj !== 'object' || obj === null) return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redact(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase().replace(/[_-]/g, ''))) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = redact(value, depth + 1);
    }
  }
  return result;
}

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 0, debug: 1, info: 2, warn: 3, error: 4,
};

const currentLevel: number = LOG_LEVELS[(process.env.LOG_LEVEL as LogLevel) ?? 'info'] ?? 2;

function isEnabled(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= currentLevel;
}

function formatJson(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta: redact(meta) } : {}),
  });
}

function formatPretty(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const prefix = `[${level.toUpperCase()}]`;
  const ts = new Date().toISOString().slice(11, 23);
  const metaStr = meta ? ` ${JSON.stringify(redact(meta))}` : '';
  return `${ts} ${prefix} ${message}${metaStr}`;
}

const useJson = (process.env.LOG_FORMAT ?? (process.env.NODE_ENV === 'production' ? 'json' : 'pretty')) === 'json';

function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  if (!isEnabled(level)) return;
  const output = useJson ? formatJson(level, message, meta) : formatPretty(level, message, meta);
  if (level === 'error') console.error(output);
  else if (level === 'warn') console.warn(output);
  else console.log(output);
}

export const logger = {
  trace: (message: string, meta?: Record<string, unknown>) => log('trace', message, meta),
  debug: (message: string, meta?: Record<string, unknown>) => log('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => log('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log('error', message, meta),
};
