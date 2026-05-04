import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getVerifiedSession: vi.fn(),
  runDailyExports: vi.fn(),
}));

vi.mock('@/modules/auth/guards', () => ({ getVerifiedSession: mocks.getVerifiedSession }));
vi.mock('@/worker/daily-exports', () => ({ runDailyExports: mocks.runDailyExports }));

describe('drive backup route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs manual backups with manual trigger', async () => {
    mocks.getVerifiedSession.mockResolvedValue({ userId: 'admin-1', role: 'ADMIN' });
    mocks.runDailyExports.mockResolvedValue(undefined);

    const { POST } = await import('@/app/api/settings/drive/backup/route');
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.runDailyExports).toHaveBeenCalledWith({ trigger: 'manual' });
  });
});
