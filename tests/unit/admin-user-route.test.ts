import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getVerifiedSession: vi.fn(),
  findUnique: vi.fn(),
  count: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  writeAuditLog: vi.fn(),
  revalidatePath: vi.fn(),
  hashPasswordSha256: vi.fn(),
  sha256: vi.fn(),
  loggerError: vi.fn(),
  serializeError: vi.fn((error: unknown) => ({ message: error instanceof Error ? error.message : String(error) })),
}));

vi.mock('@/modules/auth/guards', () => ({ getVerifiedSession: mocks.getVerifiedSession }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: mocks.findUnique,
      count: mocks.count,
      update: mocks.update,
      delete: mocks.delete,
    },
  },
}));
vi.mock('@/modules/audit/audit', () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/modules/auth/password', () => ({ hashPasswordSha256: mocks.hashPasswordSha256 }));
vi.mock('@/shared/crypto', () => ({ sha256: mocks.sha256 }));
vi.mock('@/lib/logger', () => ({
  logger: { error: mocks.loggerError },
  serializeError: mocks.serializeError,
}));

describe('admin user route hard delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVerifiedSession.mockResolvedValue({ userId: 'admin-1', role: 'ADMIN' });
    mocks.findUnique.mockResolvedValue({ id: 'admin-2', role: 'ADMIN', status: 'ACTIVE', email: 'admin@limpiador.local' });
    mocks.count.mockResolvedValue(2);
    mocks.delete.mockResolvedValue({ id: 'admin-2' });
    mocks.update.mockResolvedValue({ id: 'admin-2' });
    mocks.writeAuditLog.mockResolvedValue(undefined);
    mocks.revalidatePath.mockResolvedValue(undefined);
  });

  it('prevents deleting yourself with a visible error', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'admin-1', role: 'ADMIN', status: 'ACTIVE', email: 'admin@limpiador.local' });
    const { POST } = await import('@/app/api/admin/users/[id]/route');

    const response = await POST(createRequest('hard_delete', '2'), { params: Promise.resolve({ id: 'admin-1' }) });

    expect(response.status).toBe(303);
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toContain('userNoticeType=error');
    expect(getUserNotice(response)).toBe('No puede eliminar su propio usuario.');
  });

  it('prevents deleting the last active admin', async () => {
    mocks.count.mockResolvedValue(1);
    const { POST } = await import('@/app/api/admin/users/[id]/route');

    const response = await POST(createRequest('hard_delete', '2'), { params: Promise.resolve({ id: 'admin-2' }) });

    expect(response.status).toBe(303);
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(getUserNotice(response)).toBe('No se puede eliminar el último admin activo.');
  });

  it('surfaces hard delete failures instead of swallowing them', async () => {
    mocks.delete.mockRejectedValue(new Error('fk_violation'));
    const { POST } = await import('@/app/api/admin/users/[id]/route');

    const response = await POST(createRequest('hard_delete', '3'), { params: Promise.resolve({ id: 'admin-2' }) });

    expect(response.status).toBe(303);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'admin_user_hard_delete_failed',
      expect.objectContaining({ actorUserId: 'admin-1', targetUserId: 'admin-2' }),
    );
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toContain('userPage=3');
    expect(getUserNotice(response)).toBe('No se pudo eliminar el usuario. Revise relaciones activas e inténtelo de nuevo.');
  });

  it('allows hard delete when another active admin still exists', async () => {
    const { POST } = await import('@/app/api/admin/users/[id]/route');

    const response = await POST(createRequest('hard_delete', '4'), { params: Promise.resolve({ id: 'admin-2' }) });

    expect(response.status).toBe(303);
    expect(mocks.delete).toHaveBeenCalledWith({ where: { id: 'admin-2' } });
    expect(mocks.writeAuditLog).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/settings');
    expect(response.headers.get('location')).toContain('userPage=4');
  });
});

function createRequest(action: string, userPage: string) {
  const formData = new FormData();
  formData.set('action', action);
  formData.set('userPage', userPage);

  return new Request('http://localhost/api/admin/users/admin-2', {
    method: 'POST',
    body: formData,
  });
}

function getUserNotice(response: Response) {
  const location = response.headers.get('location');
  if (!location) return null;

  return new URL(location).searchParams.get('userNotice');
}
