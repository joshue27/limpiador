import { NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { getVerifiedSession } from '@/modules/auth/guards';
import { storeRestoreUploadChunk } from '@/modules/restore/upload-session';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const { uploadId } = await params;
  const chunkIndexHeader = request.headers.get('x-chunk-index');
  const chunkIndex = Number.parseInt(chunkIndexHeader || '', 10);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    return NextResponse.json(
      { error: 'Índice de chunk inválido.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const chunk = Buffer.from(await request.arrayBuffer());
  if (chunk.length === 0) {
    return NextResponse.json(
      { error: 'Chunk vacío.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    await storeRestoreUploadChunk({
      exportRoot: getConfig().storage.exportRoot,
      uploadId,
      chunkIndex,
      data: chunk,
    });

    return NextResponse.json(
      { ok: true, chunkIndex },
      { status: 202, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo guardar el chunk.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
