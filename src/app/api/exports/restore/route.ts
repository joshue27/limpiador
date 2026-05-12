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

  const formData = await request.formData();
  const zipFile = formData.get('zip') as File | null;
  if (!zipFile || zipFile.size === 0) {
    return NextResponse.json({ error: 'Archivo ZIP requerido' }, { status: 400 });
  }

  if (zipFile.size > MAX_RESTORE_ZIP_BYTES) {
    return NextResponse.json(
      { error: `El ZIP excede el tama\u00f1o m\u00e1ximo permitido de ${MAX_RESTORE_ZIP_BYTES / 1024 / 1024} MB.` },
      { status: 413 },
    );
  }

  try {
    const buffer = Buffer.from(await zipFile.arrayBuffer());
    const zip = await JSZip.loadAsync(buffer);
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
    await writeFile(archivePath, buffer, { flag: 'wx' });

    const archiveKey = `restore-uploads/${uploadId}.zip`;
    const restoreRun = await createRestoreRun({
      prisma,
      userId: session.userId,
      archiveKey,
      originalFilename: zipFile.name || 'restore.zip',
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
    return NextResponse.json({ error: 'Error al preparar el ZIP para restauración' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
  } catch (error) {
    console.error('[restore] Top-level error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Error interno al procesar la subida' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

function restoreZipGuardOptions(): RestoreZipGuardOptions {
  return {
    maxEntries: MAX_RESTORE_ENTRY_COUNT,
    maxTotalBytes: MAX_RESTORE_DECOMPRESSED_BYTES,
    maxEntryBytes: MAX_RESTORE_ENTRY_BYTES,
  };
}

function getZipEntryUncompressedSize(zipEntry: JSZip.JSZipObject): number | undefined {
  const withInternalData = zipEntry as JSZip.JSZipObject & {
    _data?: { uncompressedSize?: unknown };
  };
  const size = withInternalData._data?.uncompressedSize;
  return typeof size === 'number' && Number.isFinite(size) && size >= 0 ? size : undefined;
}
