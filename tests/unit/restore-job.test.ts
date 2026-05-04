import { describe, expect, it, vi } from 'vitest';

import { createRestoreRun, formatRestoreStatus, markRestoreRunFailed, markRestoreRunReady } from '@/modules/restore/restore-job';

describe('restore background job helpers', () => {
  it('creates a pending restore run before enqueueing worker processing', async () => {
    const prisma = {
      $queryRaw: vi.fn(async () => [{ id: 'restore-1' }]),
    };

    const result = await createRestoreRun({
      prisma,
      userId: 'admin-1',
      archiveKey: 'restore-uploads/restore-1.zip',
      originalFilename: 'backup.zip',
    });

    expect(result).toEqual({ id: 'restore-1', status: 'PENDING' });
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  });

  it('formats status responses with progress, restored counts, and bounded errors', () => {
    expect(formatRestoreStatus({
      id: 'restore-1',
      status: 'READY',
      progress: 100,
      counts_json: { conversationsRestored: 2, messagesRestored: 5, mediaRestored: 1 },
      error: null,
      updated_at: new Date('2026-05-01T12:00:00.000Z'),
    })).toEqual({
      id: 'restore-1',
      status: 'READY',
      progress: 100,
      counts: { conversationsRestored: 2, messagesRestored: 5, mediaRestored: 1 },
      error: null,
      updatedAt: '2026-05-01T12:00:00.000Z',
    });
  });

  it('marks success and failure states with bounded metadata', async () => {
    const prisma = { $executeRaw: vi.fn(async () => 1) };

    await markRestoreRunReady(prisma, 'restore-1', { conversationsRestored: 1, messagesRestored: 2, mediaRestored: 3 });
    await markRestoreRunFailed(prisma, 'restore-2', new Error('x'.repeat(700)));

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
  });
});
