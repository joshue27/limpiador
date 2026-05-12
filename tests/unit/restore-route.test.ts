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
vi.mock('@/modules/queue/queues', () => ({
  enqueueRestoreProcessing: mocks.enqueueRestoreProcessing,
}));
vi.mock('@/modules/restore/restore-job', () => ({
  createRestoreRun: mocks.createRestoreRun,
  markRestoreRunFailed: mocks.markRestoreRunFailed,
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/config', () => ({
  getConfig: () => ({
    storage: {
      exportRoot: 'C:/Users/josue/AppData/Local/Temp/opencode/limpiador-restore-route-tests',
    },
  }),
}));

describe('restore upload route', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await rm('C:/Users/josue/AppData/Local/Temp/opencode/limpiador-restore-route-tests', {
      recursive: true,
      force: true,
    });
    await mkdir('C:/Users/josue/AppData/Local/Temp/opencode/limpiador-restore-route-tests', {
      recursive: true,
    });
    mocks.getVerifiedSession.mockResolvedValue({ userId: 'admin-1', role: 'ADMIN' });
    mocks.createRestoreRun.mockResolvedValue({ id: 'restore-1', status: 'PENDING' });
    mocks.enqueueRestoreProcessing.mockResolvedValue({ id: 'job-1' });
  });

  it('persists a raw zip upload, creates a restore run, and enqueues background processing', async () => {
    const { POST } = await import('@/app/api/exports/restore/route');
    const file = await createRestoreZipFile('backup.zip');

    const response = await POST(
      new Request('http://localhost/api/exports/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/zip',
          'X-Restore-Filename': encodeURIComponent(file.name),
        },
        body: await file.arrayBuffer(),
      }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      restoreRunId: 'restore-1',
      status: 'PENDING',
    });
    expect(mocks.createRestoreRun).toHaveBeenCalledOnce();
    expect(mocks.enqueueRestoreProcessing).toHaveBeenCalledOnce();
    expect(mocks.createRestoreRun).toHaveBeenCalledWith(
      expect.objectContaining({ originalFilename: 'backup.zip' }),
    );
  });

  it('still accepts multipart zip uploads for compatibility', async () => {
    const { POST } = await import('@/app/api/exports/restore/route');
    const formData = new FormData();
    formData.set('zip', await createRestoreZipFile('backup-multipart.zip'));

    const response = await POST(
      new Request('http://localhost/api/exports/restore', { method: 'POST', body: formData }),
    );

    expect(response.status).toBe(202);
    expect(mocks.createRestoreRun).toHaveBeenCalledWith(
      expect.objectContaining({ originalFilename: 'backup-multipart.zip' }),
    );
  });

  it('rejects empty raw uploads before database writes or queue enqueue', async () => {
    const { POST } = await import('@/app/api/exports/restore/route');

    const response = await POST(
      new Request('http://localhost/api/exports/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip' },
        body: new Uint8Array(),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Archivo ZIP requerido' });
    expect(mocks.createRestoreRun).not.toHaveBeenCalled();
    expect(mocks.enqueueRestoreProcessing).not.toHaveBeenCalled();
  });

  it('returns a specific upload error when multipart parsing fails before reading the zip', async () => {
    const { POST } = await import('@/app/api/exports/restore/route');

    const response = await POST({
      headers: { get: vi.fn().mockReturnValue('multipart/form-data; boundary=test') },
      formData: vi.fn().mockRejectedValue(new TypeError('Failed to parse body as FormData')),
    } as unknown as Request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'No se pudo leer la subida ZIP. Verificá el archivo e intentá nuevamente.',
    });
    expect(mocks.createRestoreRun).not.toHaveBeenCalled();
    expect(mocks.enqueueRestoreProcessing).not.toHaveBeenCalled();
  });

  it('treats aborted uploads as invalid multipart instead of payload too large', async () => {
    const { POST } = await import('@/app/api/exports/restore/route');

    const response = await POST({
      headers: { get: vi.fn().mockReturnValue('multipart/form-data; boundary=test') },
      formData: vi
        .fn()
        .mockRejectedValue(new TypeError('Request aborted while parsing multipart body')),
    } as unknown as Request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'No se pudo leer la subida ZIP. Verificá el archivo e intentá nuevamente.',
    });
    expect(mocks.createRestoreRun).not.toHaveBeenCalled();
    expect(mocks.enqueueRestoreProcessing).not.toHaveBeenCalled();
  });
});

async function createRestoreZipFile(name: string): Promise<File> {
  const zip = new JSZip();
  zip.file(
    'chat.txt',
    'Contacto: Ada\nTeléfono: +50255550000\nWA ID: 50255550000\n[2026-05-01 10:00:00] CLIENTE (TEXT): Hola',
  );
  return new File([await zip.generateAsync({ type: 'arraybuffer' })], name, {
    type: 'application/zip',
  });
}
