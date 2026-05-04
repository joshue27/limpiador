import Redis from 'ioredis';

import { getConfig } from '@/lib/config';
import { logger as defaultLogger, type Logger } from '@/lib/logger';

const RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
local ttl = redis.call('PTTL', KEYS[1])
return { current, ttl }
`;

export type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: number; degraded?: true; reason?: 'limiter_unavailable' }
  | {
      allowed: false;
      retryAfterSeconds: number;
      resetAt: number;
      degraded?: true;
      reason?: 'limiter_unavailable';
    };

export type RateLimitFailurePolicy = 'fail-open' | 'fail-closed';

export type RedisRateLimitClient = {
  eval: (script: string, keyCount: number, key: string, max: string, windowMilliseconds: string) => Promise<unknown>;
};

export type RateLimitOptions = {
  policy?: RateLimitFailurePolicy;
  redis?: RedisRateLimitClient;
  now?: () => number;
  logger?: Pick<Logger, 'warn'>;
  keyPrefix?: string;
};

let redisClient: Redis | undefined;

export async function checkRateLimit(
  key: string,
  max: number,
  windowSeconds: number,
  options: RateLimitOptions = {},
): Promise<RateLimitResult> {
  const policy = options.policy ?? 'fail-closed';
  const now = options.now ?? Date.now;
  const windowMilliseconds = windowSeconds * 1000;
  const resetAtOnFailure = now() + windowMilliseconds;

  try {
    const redis = options.redis ?? (await getRateLimitRedis());
    const result = await redis.eval(
      RATE_LIMIT_SCRIPT,
      1,
      `${options.keyPrefix ?? 'rate-limit'}:${key}`,
      String(max),
      String(windowMilliseconds),
    );
    const { count, ttlMilliseconds } = parseRedisLimiterResult(result, windowMilliseconds);
    const resetAt = now() + ttlMilliseconds;

    if (count > max) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(ttlMilliseconds / 1000)),
        resetAt,
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, max - count),
      resetAt,
    };
  } catch (error) {
    const log = options.logger ?? defaultLogger;
    log.warn('rate_limiter_unavailable', {
      err: error,
      key,
      policy,
      degradedProtection: true,
    });

    if (policy === 'fail-open') {
      return {
        allowed: true,
        remaining: max,
        resetAt: resetAtOnFailure,
        degraded: true,
        reason: 'limiter_unavailable',
      };
    }

    return {
      allowed: false,
      retryAfterSeconds: windowSeconds,
      resetAt: resetAtOnFailure,
      degraded: true,
      reason: 'limiter_unavailable',
    };
  }
}

export async function disconnectRateLimitRedis(): Promise<void> {
  const client = redisClient;
  redisClient = undefined;
  await client?.quit();
}

async function getRateLimitRedis(): Promise<Redis> {
  if (!redisClient) {
    redisClient = new Redis(getConfig().redisUrl, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    await redisClient.connect();
  }
  return redisClient;
}

function parseRedisLimiterResult(result: unknown, fallbackTtlMilliseconds: number): { count: number; ttlMilliseconds: number } {
  if (!Array.isArray(result) || result.length < 2) {
    throw new Error('Unexpected Redis limiter response');
  }

  const count = toFiniteNumber(result[0], 'count');
  const rawTtl = toFiniteNumber(result[1], 'ttl');

  return {
    count,
    ttlMilliseconds: rawTtl > 0 ? rawTtl : fallbackTtlMilliseconds,
  };
}

function toFiniteNumber(value: unknown, label: string): number {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric)) {
    throw new Error(`Unexpected Redis limiter ${label}`);
  }
  return numeric;
}
