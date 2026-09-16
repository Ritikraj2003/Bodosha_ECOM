interface RateLimitConfig {
  interval: number;
  maxRequests: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

const store = new Map<string, { count: number; resetAt: number }>();

function getInMemoryClient() {
  return {
    async check(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
      const now = Date.now();
      const entry = store.get(key);

      if (!entry || now > entry.resetAt) {
        store.set(key, { count: 1, resetAt: now + config.interval });
        return { success: true, remaining: config.maxRequests - 1, reset: now + config.interval };
      }

      entry.count += 1;
      if (entry.count > config.maxRequests) {
        return { success: false, remaining: 0, reset: entry.resetAt };
      }

      return { success: true, remaining: config.maxRequests - entry.count, reset: entry.resetAt };
    },

    async reset(key: string): Promise<void> {
      store.delete(key);
    },
  };
}

function getUpstashRedisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  return {
    async check(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
      try {
        const now = Math.floor(Date.now() / 1000);
        const window = Math.ceil(config.interval / 1000);
        const windowKey = `${key}:${Math.floor(now / window)}`;

        const response = await fetch(`${url}/incr`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: windowKey }),
        });

        const data = await response.json();
        const count = data as number;
        const reset = (Math.floor(now / window) + 1) * window * 1000;

        if (count > config.maxRequests) {
          return { success: false, remaining: 0, reset };
        }

        return { success: true, remaining: config.maxRequests - count, reset };
      } catch {
        return { success: true, remaining: 1, reset: 0 };
      }
    },

    async reset(key: string): Promise<void> {
      try {
        await fetch(`${url}/del`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ key }),
        });
      } catch {}
    },
  };
}

type RateLimitClient = ReturnType<typeof getInMemoryClient>;

let client: RateLimitClient;

function getClient(): RateLimitClient {
  if (client) return client;
  const redis = getUpstashRedisClient();
  client = redis ?? getInMemoryClient();
  return client;
}

export async function rateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  return getClient().check(key, config);
}

export async function resetRateLimit(key: string): Promise<void> {
  return getClient().reset(key);
}

export const RATE_LIMIT_CONFIGS = {
  strict: { interval: 60_000, maxRequests: 10 },
  default: { interval: 60_000, maxRequests: 30 },
  relaxed: { interval: 60_000, maxRequests: 100 },
  generous: { interval: 60_000, maxRequests: 300 },
} as const;

export function rateLimitKey(prefix: string, identifier: string): string {
  return `ratelimit:${prefix}:${identifier}`;
}
