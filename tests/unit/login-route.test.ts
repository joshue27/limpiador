import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(() => ({ rateLimits: { login: { max: 5, windowSeconds: 60 } } })),
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 4, resetAt: Date.now() + 60_000 })),
  clientIp: vi.fn(() => '203.0.113.10'),
  userAgent: vi.fn(() => 'vitest'),
  verifyPasswordDual: vi.fn(),
  hashPasswordSha256: vi.fn(),
  sha256: vi.fn(),
  setSessionCookie: vi.fn(async () => undefined),
  writeAuditLog: vi.fn(async () => undefined),
  isEmailConfigured: vi.fn(async () => false),
  sendVerificationEmail: vi.fn(async () => undefined),
  generateNumericCode: vi.fn(() => '123456'),
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/config', () => ({ getConfig: mocks.getConfig }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/request', () => ({ clientIp: mocks.clientIp, userAgent: mocks.userAgent }));
vi.mock('@/modules/auth/password', () => ({
  verifyPasswordDual: mocks.verifyPasswordDual,
  hashPasswordSha256: mocks.hashPasswordSha256,
}));
vi.mock('@/modules/auth/session', () => ({ setSessionCookie: mocks.setSessionCookie }));
vi.mock('@/modules/audit/audit', () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock('@/modules/email/sender', () => ({
  isEmailConfigured: mocks.isEmailConfigured,
  sendVerificationEmail: mocks.sendVerificationEmail,
}));
vi.mock('@/modules/auth/codes', () => ({ generateNumericCode: mocks.generateNumericCode }));
vi.mock('@/shared/crypto', () => ({ sha256: mocks.sha256 }));

describe('login route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'ada@example.com',
      name: 'Ada',
      role: 'ADMIN',
      status: 'ACTIVE',
      passwordHash: 'stored-hash',
      verifiedAt: new Date('2026-05-01T00:00:00.000Z'),
    });
    mocks.prisma.user.update.mockResolvedValue(undefined);
    mocks.sha256.mockResolvedValue('sha256-password');
    mocks.hashPasswordSha256.mockResolvedValue('upgraded-password-hash');
  });

  it('accepts legacy plaintext login payloads and upgrades legacy password hashes after successful fallback verification', async () => {
    mocks.verifyPasswordDual.mockResolvedValue({ valid: true, upgraded: true });
    const { POST } = await import('@/app/api/auth/login/route');

    const response = await POST(createRequest({ email: 'ada@example.com', password: 'legacy-password' }));

    expect(response.status).toBe(200);
    expect(mocks.sha256).toHaveBeenCalledWith('legacy-password');
    expect(mocks.verifyPasswordDual).toHaveBeenCalledWith('sha256-password', 'legacy-password', 'stored-hash');
    expect(mocks.hashPasswordSha256).toHaveBeenCalledWith('sha256-password');
    expect(mocks.prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-1' },
      data: expect.objectContaining({ passwordHash: 'upgraded-password-hash' }),
    }));
    expect(mocks.setSessionCookie).toHaveBeenCalledOnce();
  });

  it('keeps supporting hashed login payloads for already-upgraded users', async () => {
    mocks.verifyPasswordDual.mockResolvedValue({ valid: true, upgraded: false });
    const { POST } = await import('@/app/api/auth/login/route');

    const response = await POST(createRequest({ email: 'ada@example.com', hash: 'client-sha256-hash' }));

    expect(response.status).toBe(200);
    expect(mocks.verifyPasswordDual).toHaveBeenCalledWith('client-sha256-hash', '', 'stored-hash');
    expect(mocks.hashPasswordSha256).not.toHaveBeenCalled();
    expect(mocks.setSessionCookie).toHaveBeenCalledOnce();
  });
});

function createRequest(body: Record<string, unknown>): NextRequest {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as NextRequest;
}
