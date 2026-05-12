import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  assembleRestoreUpload,
  createRestoreUploadSession,
  restoreUploadSessionDir,
  storeRestoreUploadChunk,
} from '@/modules/restore/upload-session';

const exportRoot =
  'C:/Users/josue/AppData/Local/Temp/opencode/limpiador-restore-upload-session-tests';

describe('restore upload session', () => {
  beforeEach(async () => {
    await rm(exportRoot, { recursive: true, force: true });
    await mkdir(exportRoot, { recursive: true });
  });

  it('assembles uploaded chunks into a restore zip file and cleans the temp session', async () => {
    const session = await createRestoreUploadSession({
      exportRoot,
      fileName: 'backup.zip',
      fileSize: 11,
      chunkCount: 2,
    });

    await storeRestoreUploadChunk({
      exportRoot,
      uploadId: session.id,
      chunkIndex: 0,
      data: Buffer.from('hello '),
    });
    await storeRestoreUploadChunk({
      exportRoot,
      uploadId: session.id,
      chunkIndex: 1,
      data: Buffer.from('world'),
    });

    const assembled = await assembleRestoreUpload({ exportRoot, uploadId: session.id });
    const content = await readFile(assembled.archivePath, 'utf8');

    expect(assembled.fileName).toBe('backup.zip');
    expect(assembled.fileSize).toBe(11);
    expect(content).toBe('hello world');
    await expect(stat(restoreUploadSessionDir(exportRoot, session.id))).rejects.toThrow();
  });

  it('fails when a chunk is missing and deletes the partial assembled archive', async () => {
    const session = await createRestoreUploadSession({
      exportRoot,
      fileName: 'broken.zip',
      fileSize: 10,
      chunkCount: 2,
    });

    await storeRestoreUploadChunk({
      exportRoot,
      uploadId: session.id,
      chunkIndex: 0,
      data: Buffer.from('only-half'),
    });

    const archivePath = path.join(exportRoot, 'restore-uploads', `${session.id}.zip`);
    await expect(assembleRestoreUpload({ exportRoot, uploadId: session.id })).rejects.toThrow();
    await expect(stat(archivePath)).rejects.toThrow();
  });

  it('rejects chunks whose total bytes exceed the declared file size', async () => {
    const session = await createRestoreUploadSession({
      exportRoot,
      fileName: 'oversized.zip',
      fileSize: 5,
      chunkCount: 2,
    });

    await storeRestoreUploadChunk({
      exportRoot,
      uploadId: session.id,
      chunkIndex: 0,
      data: Buffer.from('1234'),
    });

    await expect(
      storeRestoreUploadChunk({
        exportRoot,
        uploadId: session.id,
        chunkIndex: 1,
        data: Buffer.from('6789'),
      }),
    ).rejects.toThrow('La subida excede el tamaño esperado del ZIP.');
  });
});
