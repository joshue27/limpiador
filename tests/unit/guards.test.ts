import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppSession } from '@/modules/auth/session';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

vi.mock('@/modules/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/auth/session')>();
  return { ...actual, getCurrentSession: vi.fn() };
});

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));

import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/modules/auth/session';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/modules/auth/guards';

const mockedGetCurrentSession = vi.mocked(getCurrentSession);
const mockedFindUnique = vi.mocked(prisma.user.findUnique);
const mockedRedirect = vi.mocked(redirect);

function buildSession(overrides: Partial<AppSession> = {}): AppSession {
  return {
    userId: 'user-1',
    email: 'op@test.com',
    name: 'Operator',
    role: 'OPERATOR',
    permissions: {},
    ...overrides,
  };
}

function mockUser(s: AppSession) {
  return {
    id: s.userId,
    email: s.email,
    name: s.name,
    role: s.role,
    status: 'ACTIVE' as const,
    permissions: s.permissions,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('requirePermission', () => {
  it('returns the session for ADMIN without checking permissions', async () => {
    const adminSession = buildSession({ role: 'ADMIN' });
    mockedGetCurrentSession.mockResolvedValue(adminSession);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedFindUnique.mockResolvedValue(mockUser(adminSession) as any);

    const result = await requirePermission('dashboard');

    expect(result).toEqual(adminSession);
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it('returns the session for OPERATOR that has the required permission', async () => {
    const opSession = buildSession({ permissions: { dashboard: true } });
    mockedGetCurrentSession.mockResolvedValue(opSession);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedFindUnique.mockResolvedValue(mockUser(opSession) as any);

    const result = await requirePermission('dashboard');

    expect(result).toEqual(opSession);
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it('redirects to /dashboard when OPERATOR lacks the required permission key (key missing)', async () => {
    const opSession = buildSession({ permissions: { inbox: true } });
    mockedGetCurrentSession.mockResolvedValue(opSession);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedFindUnique.mockResolvedValue(mockUser(opSession) as any);

    await requirePermission('dashboard');

    expect(mockedRedirect).toHaveBeenCalledWith('/dashboard');
  });

  it('redirects to /dashboard when OPERATOR has the permission key set to false', async () => {
    const opSession = buildSession({ permissions: { dashboard: false } });
    mockedGetCurrentSession.mockResolvedValue(opSession);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedFindUnique.mockResolvedValue(mockUser(opSession) as any);

    await requirePermission('dashboard');

    expect(mockedRedirect).toHaveBeenCalledWith('/dashboard');
  });

  it('redirects to /dashboard when OPERATOR has undefined permissions', async () => {
    const opSession = buildSession({ permissions: undefined });
    mockedGetCurrentSession.mockResolvedValue(opSession);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedFindUnique.mockResolvedValue(mockUser(opSession) as any);

    await requirePermission('dashboard');

    expect(mockedRedirect).toHaveBeenCalledWith('/dashboard');
  });
});
