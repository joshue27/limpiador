import { NextResponse } from 'next/server';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';

import { getConfig } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import { getVerifiedSession } from '@/modules/auth/guards';
import { enqueueRestoreProcessing } from '@/modules/queue/queues';
import { createRestoreRun, markRestoreRunFailed } from '@/modules/restore/restore-job';
import { validateRestoreZipEntryPlan } from '@/modules/restore/restore-zip-guard';
import type { RestoreZipGuardOptions } from '@/modules/restore/restore-zip-guard';

export const runtime = 'nodejs';

type RestoreUploadPayload = {
  buffer: Buffer;
  fileName: string;
};

const MAX_RESTORE_ZIP_BYTES = 200 * 1024 * 1024;
const MAX_RESTORE_ENTRY_COUNT = 500;
const MAX_RESTORE_DECOMPRESSED_BYTES = 2048 * 1024 * 1024;
const MAX_RESTORE_ENTRY_BYTES = 200 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const session = await getVerifiedSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    let upload: RestoreUploadPayload;
    try {
      upload = await readRestoreUpload(request);
    } catch (error) {
      if (isRestoreUploadInputError(error)) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status, headers: { 'Cache-Control': 'no-store' } },
        );
      }

      console.error('[restore] Failed to read upload body:', error);
      const uploadError = describeRestoreUploadError(error);
      return NextResponse.json(
        { error: uploadError.message },
        { status: uploadError.status, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (upload.buffer.length > MAX_RESTORE_ZIP_BYTES) {
      return NextResponse.json(
        {
          error: `El ZIP excede el tama\u00f1o m\u00e1ximo permitido de ${MAX_RESTORE_ZIP_BYTES / 1024 / 1024} MB.`,
        },
        { status: 413 },
      );
    }

    try {
      const zip = await JSZip.loadAsync(upload.buffer);
      const restorableEntries = Object.entries(zip.files).filter(([, zipEntry]) => !zipEntry.dir);
      const entryPlan = restorableEntries.map(([filename, zipEntry]) => ({
        name: filename,
        size: getZipEntryUncompressedSize(zipEntry),
      }));
      const planValidation = validateRestoreZipEntryPlan(entryPlan, restoreZipGuardOptions());
      if (!planValidation.ok) {
        return NextResponse.json(
          { error: planValidation.error },
          { status: planValidation.status, headers: { 'Cache-Control': 'no-store' } },
        );
      }

      const uploadId = randomUUID();
      const uploadDir = path.join(getConfig().storage.exportRoot, 'restore-uploads');
      const archivePath = path.join(uploadDir, `${uploadId}.zip`);
      await mkdir(uploadDir, { recursive: true });
      await writeFile(archivePath, upload.buffer, { flag: 'wx' });

      const archiveKey = `restore-uploads/${uploadId}.zip`;
      const restoreRun = await createRestoreRun({
        prisma,
        userId: session.userId,
        archiveKey,
        originalFilename: upload.fileName,
      });

      try {
        await enqueueRestoreProcessing(restoreRun.id, archivePath, session.userId);
      } catch (error) {
        await markRestoreRunFailed(prisma, restoreRun.id, error);
        await rm(archivePath, { force: true }).catch(() => undefined);
        return NextResponse.json(
          { error: 'No se pudo encolar la restauración' },
          { status: 503, headers: { 'Cache-Control': 'no-store' } },
        );
      }

      return NextResponse.json(
        { ok: true, restoreRunId: restoreRun.id, status: restoreRun.status },
        { status: 202, headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (error) {
      console.error('[restore] Unexpected error:', error instanceof Error ? error.message : error);
      return NextResponse.json(
        { error: 'Error al preparar el ZIP para restauración' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  } catch (error) {
    console.error('[restore] Top-level error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Error interno al procesar la subida' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

function createRestoreUploadInputError(status: number, message: string) {
  const error = new Error(message) as Error & {
    code: 'RESTORE_UPLOAD_INPUT_ERROR';
    status: number;
  };
  error.code = 'RESTORE_UPLOAD_INPUT_ERROR';
  error.status = status;
  return error;
}

function isRestoreUploadInputError(
  error: unknown,
): error is Error & { code: 'RESTORE_UPLOAD_INPUT_ERROR'; status: number } {
  return (
    error instanceof Error &&
    'code' in error &&
    'status' in error &&
    error.code === 'RESTORE_UPLOAD_INPUT_ERROR' &&
    typeof error.status === 'number'
  );
}

async function readRestoreUpload(request: Request): Promise<RestoreUploadPayload> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const zipFile = formData.get('zip');
    if (!(zipFile instanceof File) || zipFile.size === 0) {
      throw createRestoreUploadInputError(400, 'Archivo ZIP requerido');
    }

    return {
      buffer: Buffer.from(await zipFile.arrayBuffer()),
      fileName: zipFile.name || 'restore.zip',
    };
  }

  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.length === 0) {
    throw createRestoreUploadInputError(400, 'Archivo ZIP requerido');
  }

  return {
    buffer,
    fileName: decodeRestoreFileName(request.headers.get('x-restore-filename')) || 'restore.zip',
  };
}

function decodeRestoreFileName(fileNameHeader: string | null): string | null {
  if (!fileNameHeader?.trim()) return null;

  try {
    return decodeURIComponent(fileNameHeader).trim() || null;
  } catch {
    return fileNameHeader.trim() || null;
  }
}

function restoreZipGuardOptions(): RestoreZipGuardOptions {
  return {
    maxEntries: MAX_RESTORE_ENTRY_COUNT,
    maxTotalBytes: MAX_RESTORE_DECOMPRESSED_BYTES,
    maxEntryBytes: MAX_RESTORE_ENTRY_BYTES,
  };
}

function describeRestoreUploadError(error: unknown): { status: number; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes('content-length') ||
    normalizedMessage.includes('too large') ||
    normalizedMessage.includes('size limit')
  ) {
    return {
      status: 413,
      message:
        'No se pudo leer la subida ZIP. Puede que el archivo exceda el límite del servidor o que la petición se haya cortado antes de terminar.',
    };
  }

  if (
    normalizedMessage.includes('formdata') ||
    normalizedMessage.includes('multipart') ||
    normalizedMessage.includes('request body') ||
    normalizedMessage.includes('request aborted') ||
    normalizedMessage.includes('body')
  ) {
    return {
      status: 400,
      message: 'No se pudo leer la subida ZIP. Verificá el archivo e intentá nuevamente.',
    };
  }

  return {
    status: 400,
    message: 'No se pudo leer la subida ZIP. Verificá el archivo e intentá nuevamente.',
  };
}

function getZipEntryUncompressedSize(zipEntry: JSZip.JSZipObject): number | undefined {
  const withInternalData = zipEntry as JSZip.JSZipObject & {
    _data?: { uncompressedSize?: unknown };
  };
  const size = withInternalData._data?.uncompressedSize;
  return typeof size === 'number' && Number.isFinite(size) && size >= 0 ? size : undefined;
}
