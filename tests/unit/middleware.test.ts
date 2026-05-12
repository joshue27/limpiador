import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifySessionToken: vi.fn(),
}));

vi.mock('@/modules/auth/session', () => ({ verifySessionToken: mocks.verifySessionToken }));

describe('middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips auth token verification for restore upload routes handled in-route', async () => {
    const { middleware } = await import('@/middleware');

    const response = await middleware({
      nextUrl: { pathname: '/api/exports/restore' },
      cookies: { get: vi.fn() },
      url: 'http://localhost/api/exports/restore',
    } as never);

    expect(mocks.verifySessionToken).not.toHaveBeenCalled();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('still blocks protected api routes without a valid session', async () => {
    const { middleware } = await import('@/middleware');

    const response = await middleware({
      nextUrl: { pathname: '/api/contacts' },
      cookies: { get: vi.fn().mockReturnValue(undefined) },
      url: 'http://localhost/api/contacts',
    } as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });
});
