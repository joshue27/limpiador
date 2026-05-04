import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
  userCount: vi.fn(),
  createUser: vi.fn(),
  writeAuditLog: vi.fn(),
  hashPasswordSha256: vi.fn(async () => 'bcrypt-hash'),
  sha256: vi.fn(async () => 'sha256-hash'),
}));

vi.mock('@/lib/logger', () => ({ logger: { warn: mocks.loggerWarn } }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      count: mocks.userCount,
      create: mocks.createUser,
    },
  },
}));
vi.mock('@/modules/audit/audit', () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock('@/modules/auth/password', () => ({ hashPasswordSha256: mocks.hashPasswordSha256 }));
vi.mock('@/shared/crypto', () => ({ sha256: mocks.sha256 }));

const previousNodeEnv = process.env.NODE_ENV;
const previousAllowFlag = process.env.ALLOW_DEV_BOOTSTRAP_ADMIN;
const previousSetupSecret = process.env.DEV_BOOTSTRAP_ADMIN_SECRET;

describe('bootstrap admin route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Reflect.set(process.env, 'NODE_ENV', 'development');
    delete process.env.ALLOW_DEV_BOOTSTRAP_ADMIN;
    delete process.env.DEV_BOOTSTRAP_ADMIN_SECRET;
    mocks.userCount.mockResolvedValue(0);
    mocks.createUser.mockResolvedValue({ id: 'admin-1' });
  });

  afterEach(() => {
    const env = process.env as Record<string, string | undefined>;
    if (previousNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previousNodeEnv;
    if (previousAllowFlag === undefined) delete process.env.ALLOW_DEV_BOOTSTRAP_ADMIN;
    else process.env.ALLOW_DEV_BOOTSTRAP_ADMIN = previousAllowFlag;
    if (previousSetupSecret === undefined) delete process.env.DEV_BOOTSTRAP_ADMIN_SECRET;
    else process.env.DEV_BOOTSTRAP_ADMIN_SECRET = previousSetupSecret;
  });

  it('fails closed by default outside production', async () => {
    const { POST } = await import('@/app/api/dev/bootstrap-admin/route');

    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Bootstrap requires explicit setup enablement' });
    expect(mocks.userCount).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).toHaveBeenCalledWith('dev_bootstrap_admin_rejected', expect.objectContaining({ reason: 'bootstrap_not_enabled' }));
  });

  it('requires the configured setup secret when present', async () => {
    process.env.DEV_BOOTSTRAP_ADMIN_SECRET = 'top-secret';
    const { POST } = await import('@/app/api/dev/bootstrap-admin/route');

    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).toHaveBeenCalledWith('dev_bootstrap_admin_rejected', expect.objectContaining({ reason: 'invalid_setup_secret' }));
  });

  it('allows bootstrap when explicitly enabled and the setup secret matches', async () => {
    process.env.ALLOW_DEV_BOOTSTRAP_ADMIN = 'true';
    process.env.DEV_BOOTSTRAP_ADMIN_SECRET = 'top-secret';
    const { POST } = await import('@/app/api/dev/bootstrap-admin/route');

    const response = await POST(createRequest({ 'x-setup-secret': 'top-secret' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.userCount).toHaveBeenCalledOnce();
    expect(mocks.createUser).toHaveBeenCalledOnce();
  });
});

function createRequest(headers: HeadersInit = {}): NextRequest {
  return new Request('http://localhost/api/dev/bootstrap-admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ email: 'admin@test.local', password: 'super-secure-password' }),
  }) as NextRequest;
}
