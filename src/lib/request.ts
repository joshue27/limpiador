import { getConfig } from '@/lib/config';
import { checkRateLimit, type RateLimitOptions, type RateLimitResult } from '@/lib/rate-limit';

export function clientIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const parts = forwardedFor.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export function userAgent(request: Request) {
  return request.headers.get('user-agent') || null;
}

export function checkApiRateLimit(
  scope: string,
  request: Request,
  options: Omit<RateLimitOptions, 'policy'> = {},
): Promise<RateLimitResult> {
  const config = getConfig();
  return checkRateLimit(
    `api:${scope}:${clientIp(request)}`,
    config.rateLimits.api.max,
    config.rateLimits.api.windowSeconds,
    { ...options, policy: 'fail-open' },
  );
}

export function checkAuthRateLimit(
  scope: string,
  request: Request,
  options: Omit<RateLimitOptions, 'policy'> = {},
): Promise<RateLimitResult> {
  const config = getConfig();
  const authLimits = config.rateLimits.login ?? config.rateLimits.api;
  return checkRateLimit(
    `auth:${scope}:${clientIp(request)}`,
    authLimits.max,
    authLimits.windowSeconds,
    { ...options, policy: 'fail-closed' },
  );
}

export function checkSensitiveAuthRateLimit(
  scope: string,
  request: Request,
  identity: string,
  options: Omit<RateLimitOptions, 'policy'> = {},
): Promise<RateLimitResult> {
  const config = getConfig();
  const authLimits = config.rateLimits.login ?? config.rateLimits.api;
  const normalizedIdentity = identity.trim().toLowerCase();
  return checkRateLimit(
    `auth:${scope}:${clientIp(request)}:${normalizedIdentity}`,
    Math.max(3, Math.min(authLimits.max, 10)),
    authLimits.windowSeconds,
    { ...options, policy: 'fail-closed' },
  );
}
