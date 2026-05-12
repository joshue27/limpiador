import { NextResponse } from 'next/server';
import path from 'node:path';
import { rm } from 'node:fs/promises';

import { getConfig } from '@/lib/config';
import { getVerifiedSession } from '@/modules/auth/guards';
import { queueRestoreArchive } from '@/modules/restore/queue-restore';
import { assembleRestoreUpload } from '@/modules/restore/upload-session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const body = (await request.json().catch(() => null)) as { uploadId?: string } | null;
  if (!body?.uploadId?.trim()) {
    return NextResponse.json(
      { error: 'Upload inválido.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const assembled = await assembleRestoreUpload({
      exportRoot: getConfig().storage.exportRoot,
      uploadId: body.uploadId.trim(),
    });

    try {
      const archiveKey = path.posix.join(
        'restore-uploads',
        path.posix.basename(assembled.archivePath),
      );
      const restoreRun = await queueRestoreArchive({
        archivePath: assembled.archivePath,
        archiveKey,
        originalFilename: assembled.fileName,
        userId: session.userId,
      });

      return NextResponse.json(
        { ok: true, restoreRunId: restoreRun.id, status: restoreRun.status },
        { status: 202, headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (error) {
      await rm(assembled.archivePath, { force: true }).catch(() => undefined);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'No se pudo encolar la restauración' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo completar la subida.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
