import { describe, expect, it, vi } from 'vitest';

import { checkApiRateLimit, checkAuthRateLimit, clientIp, userAgent } from '@/lib/request';
import type { RedisRateLimitClient } from '@/lib/rate-limit';

vi.mock('@/lib/config', () => ({
  getConfig: () => ({
    rateLimits: {
      api: { max: 3, windowSeconds: 30 },
      login: { max: 5, windowSeconds: 60 },
    },
  }),
}));

const passingRedis: RedisRateLimitClient = {
  eval: async () => [1, 30_000],
};

describe('request helpers', () => {
  it('extracts client IP and user agent from request headers', () => {
    const request = new Request('https://example.test/api', {
      headers: {
        'x-forwarded-for': '203.0.113.10, 198.51.100.2',
        'user-agent': 'Vitest Browser',
      },
    });

    expect(clientIp(request)).toBe('198.51.100.2');
    expect(userAgent(request)).toBe('Vitest Browser');
  });

  it('awaits the distributed API limiter using scope and client IP', async () => {
    const request = new Request('https://example.test/api', {
      headers: { 'x-forwarded-for': '203.0.113.20' },
    });

    await expect(
      checkApiRateLimit('media-download:user-1', request, {
        redis: passingRedis,
        now: () => 2_000,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      remaining: 2,
      resetAt: 32_000,
    });
  });

  it('fails closed for auth-code API limits when Redis is unavailable', async () => {
    const request = new Request('https://example.test/api/auth/verify', {
      headers: { 'x-forwarded-for': '203.0.113.30' },
    });
    const failingRedis: RedisRateLimitClient = {
      eval: async () => {
        throw new Error('redis down');
      },
    };

    await expect(
      checkAuthRateLimit('auth-verify', request, {
        redis: failingRedis,
        now: () => 10_000,
        logger: { warn: vi.fn() },
      }),
    ).resolves.toMatchObject({
      allowed: false,
      retryAfterSeconds: 60,
      resetAt: 70_000,
      degraded: true,
      reason: 'limiter_unavailable',
    });
  });
});
