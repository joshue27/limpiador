import { describe, expect, it } from 'vitest';

import { checkRateLimit, type RedisRateLimitClient } from '@/lib/rate-limit';

type Entry = { count: number; expiresAt: number };

class SharedRedisLimiterStore {
  readonly buckets = new Map<string, Entry>();
  unavailable = false;

  createClient(now: () => number): RedisRateLimitClient {
    return {
      eval: async (_script, _keyCount, key, max, windowMilliseconds) => {
        if (this.unavailable) {
          throw new Error('Redis unavailable');
        }

        const limit = Number(max);
        const ttl = Number(windowMilliseconds);
        const current = this.buckets.get(key);
        const currentTime = now();
        const active = current && current.expiresAt > currentTime ? current : undefined;
        const next: Entry = active
          ? { count: active.count + 1, expiresAt: active.expiresAt }
          : { count: 1, expiresAt: currentTime + ttl };

        this.buckets.set(key, next);

        return [Math.min(next.count, limit + 1), Math.max(1, next.expiresAt - currentTime)];
      },
    };
  }
}

describe('checkRateLimit', () => {
  it('uses shared Redis state across simulated application instances', async () => {
    let now = 1_000;
    const store = new SharedRedisLimiterStore();
    const instanceA = store.createClient(() => now);
    const instanceB = store.createClient(() => now);

    await expect(checkRateLimit('login:ip:203.0.113.10', 2, 60, { redis: instanceA, now: () => now })).resolves.toMatchObject({
      allowed: true,
      remaining: 1,
      resetAt: 61_000,
    });
    await expect(checkRateLimit('login:ip:203.0.113.10', 2, 60, { redis: instanceB, now: () => now })).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
      resetAt: 61_000,
    });

    await expect(checkRateLimit('login:ip:203.0.113.10', 2, 60, { redis: instanceA, now: () => now })).resolves.toMatchObject({
      allowed: false,
      retryAfterSeconds: 60,
      resetAt: 61_000,
    });

    now = 61_001;
    await expect(checkRateLimit('login:ip:203.0.113.10', 2, 60, { redis: instanceB, now: () => now })).resolves.toMatchObject({
      allowed: true,
      remaining: 1,
      resetAt: 121_001,
    });
  });

  it('fails closed for auth/login limits when Redis is unavailable', async () => {
    const warnings: unknown[] = [];
    const store = new SharedRedisLimiterStore();
    store.unavailable = true;

    await expect(
      checkRateLimit('login:email:user@example.com', 5, 900, {
        policy: 'fail-closed',
        redis: store.createClient(() => 10_000),
        now: () => 10_000,
        logger: { warn: (_event, context) => warnings.push(context) },
      }),
    ).resolves.toMatchObject({
      allowed: false,
      retryAfterSeconds: 900,
      resetAt: 910_000,
      degraded: true,
      reason: 'limiter_unavailable',
    });
    expect(warnings).toEqual([
      expect.objectContaining({ key: 'login:email:user@example.com', policy: 'fail-closed', degradedProtection: true }),
    ]);
  });

  it('fails open with a structured warning for lower-risk API limits when Redis is unavailable', async () => {
    const warnings: unknown[] = [];
    const store = new SharedRedisLimiterStore();
    store.unavailable = true;

    await expect(
      checkRateLimit('api:media-download:user-1:203.0.113.10', 120, 60, {
        policy: 'fail-open',
        redis: store.createClient(() => 5_000),
        now: () => 5_000,
        logger: { warn: (_event, context) => warnings.push(context) },
      }),
    ).resolves.toMatchObject({
      allowed: true,
      remaining: 120,
      resetAt: 65_000,
      degraded: true,
      reason: 'limiter_unavailable',
    });
    expect(store.buckets.size).toBe(0);
    expect(warnings).toEqual([
      expect.objectContaining({ key: 'api:media-download:user-1:203.0.113.10', policy: 'fail-open', degradedProtection: true }),
    ]);
  });
});
