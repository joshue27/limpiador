import { NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { getVerifiedSession } from '@/modules/auth/guards';
import { createRestoreUploadSession } from '@/modules/restore/upload-session';

export const runtime = 'nodejs';

const MAX_RESTORE_ZIP_BYTES = 200 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    fileName?: string;
    fileSize?: number;
    chunkCount?: number;
  } | null;

  const fileName = body?.fileName?.trim();
  const rawFileSize = body?.fileSize;
  const rawChunkCount = body?.chunkCount;

  if (
    !fileName ||
    typeof rawFileSize !== 'number' ||
    !Number.isFinite(rawFileSize) ||
    typeof rawChunkCount !== 'number' ||
    !Number.isFinite(rawChunkCount)
  ) {
    return NextResponse.json(
      { error: 'Metadatos de subida inválidos.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const fileSize = rawFileSize;
  const chunkCount = rawChunkCount;

  if (fileSize <= 0 || fileSize > MAX_RESTORE_ZIP_BYTES) {
    return NextResponse.json(
      {
        error: `El ZIP excede el tama\u00f1o m\u00e1ximo permitido de ${MAX_RESTORE_ZIP_BYTES / 1024 / 1024} MB.`,
      },
      { status: 413, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (chunkCount <= 0 || chunkCount > 10_000) {
    return NextResponse.json(
      { error: 'Cantidad de chunks inválida.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const sessionInfo = await createRestoreUploadSession({
    exportRoot: getConfig().storage.exportRoot,
    fileName,
    fileSize,
    chunkCount,
  });

  return NextResponse.json(
    { ok: true, uploadId: sessionInfo.id },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
}
