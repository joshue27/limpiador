import { NextResponse } from 'next/server';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { getConfig } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import { resolvePrivatePath } from '@/lib/private-files';
import { getVerifiedSession } from '@/modules/auth/guards';
import { enqueueRestoreProcessing } from '@/modules/queue/queues';
import { createRestoreRun, markRestoreRunFailed } from '@/modules/restore/restore-job';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { path?: string } | null;
  if (!body?.path?.trim()) {
    return NextResponse.json({ error: 'Ruta del archivo requerida' }, { status: 400 });
  }

  // Validate the path is within allowed directories (exports or backup root)
  const allowedRoots = [getConfig().storage.exportRoot, getConfig().storage.backupRoot].filter(
    Boolean,
  );

  let resolvedPath = '';
  for (const root of allowedRoots) {
    try {
      resolvedPath = await resolvePrivatePath(root, path.relative(root, body.path));
      break;
    } catch {
      continue;
    }
  }

  if (!resolvedPath) {
    return NextResponse.json(
      {
        error: 'La ruta no está dentro de un directorio permitido (exports o backups).',
      },
      { status: 400 },
    );
  }

  try {
    // Copy to restore uploads so the worker has a stable file
    const uploadId = randomUUID();
    const uploadDir = path.join(getConfig().storage.exportRoot, 'restore-uploads');
    const archivePath = path.join(uploadDir, `${uploadId}.zip`);
    await mkdir(uploadDir, { recursive: true });
    await copyFile(resolvedPath, archivePath);

    const archiveKey = `restore-uploads/${uploadId}.zip`;
    const restoreRun = await createRestoreRun({
      prisma,
      userId: session.userId,
      archiveKey,
      originalFilename: path.basename(resolvedPath),
    });

    try {
      await enqueueRestoreProcessing(restoreRun.id, archivePath, session.userId);
    } catch (error) {
      await markRestoreRunFailed(prisma, restoreRun.id, error);
      return NextResponse.json({ error: 'No se pudo encolar la restauración' }, { status: 503 });
    }

    return NextResponse.json(
      {
        ok: true,
        restoreRunId: restoreRun.id,
        status: restoreRun.status,
      },
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Error al preparar la restauración',
      },
      { status: 500 },
    );
  }
}
