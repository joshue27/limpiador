import { mkdir, rm } from 'node:fs/promises';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getVerifiedSession: vi.fn(),
  enqueueRestoreProcessing: vi.fn(),
  createRestoreRun: vi.fn(),
  markRestoreRunFailed: vi.fn(),
}));

vi.mock('@/modules/auth/guards', () => ({ getVerifiedSession: mocks.getVerifiedSession }));
vi.mock('@/modules/queue/queues', () => ({ enqueueRestoreProcessing: mocks.enqueueRestoreProcessing }));
vi.mock('@/modules/restore/restore-job', () => ({
  createRestoreRun: mocks.createRestoreRun,
  markRestoreRunFailed: mocks.markRestoreRunFailed,
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/config', () => ({
  getConfig: () => ({ storage: { exportRoot: 'C:/Users/josue/AppData/Local/Temp/opencode/limpiador-restore-route-tests' } }),
}));

describe('restore upload route', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await rm('C:/Users/josue/AppData/Local/Temp/opencode/limpiador-restore-route-tests', { recursive: true, force: true });
    await mkdir('C:/Users/josue/AppData/Local/Temp/opencode/limpiador-restore-route-tests', { recursive: true });
    mocks.getVerifiedSession.mockResolvedValue({ userId: 'admin-1', role: 'ADMIN' });
    mocks.createRestoreRun.mockResolvedValue({ id: 'restore-1', status: 'PENDING' });
    mocks.enqueueRestoreProcessing.mockResolvedValue({ id: 'job-1' });
  });

  it('persists a guarded archive, creates a restore run, and enqueues background processing', async () => {
    const { POST } = await import('@/app/api/exports/restore/route');
    const formData = new FormData();
    formData.set('zip', await createRestoreZipFile('backup.zip'));

    const response = await POST(new Request('http://localhost/api/exports/restore', { method: 'POST', body: formData }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ ok: true, restoreRunId: 'restore-1', status: 'PENDING' });
    expect(mocks.createRestoreRun).toHaveBeenCalledOnce();
    expect(mocks.enqueueRestoreProcessing).toHaveBeenCalledOnce();
  });

  it('rejects oversized restore plans before database writes or queue enqueue', async () => {
    const { POST } = await import('@/app/api/exports/restore/route');
    const zip = new JSZip();
    for (let index = 0; index < 501; index += 1) zip.file(`chat-${index}.txt`, 'x');
    const file = new File([await zip.generateAsync({ type: 'arraybuffer' })], 'too-many.zip', { type: 'application/zip' });
    const formData = new FormData();
    formData.set('zip', file);

    const response = await POST(new Request('http://localhost/api/exports/restore', { method: 'POST', body: formData }));

    expect(response.status).toBe(413);
    expect(mocks.createRestoreRun).not.toHaveBeenCalled();
    expect(mocks.enqueueRestoreProcessing).not.toHaveBeenCalled();
  });
});

async function createRestoreZipFile(name: string): Promise<File> {
  const zip = new JSZip();
  zip.file('chat.txt', 'Contacto: Ada\nTeléfono: +50255550000\nWA ID: 50255550000\n[2026-05-01 10:00:00] CLIENTE (TEXT): Hola');
  return new File([await zip.generateAsync({ type: 'arraybuffer' })], name, { type: 'application/zip' });
}
