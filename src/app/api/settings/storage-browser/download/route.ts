import { createReadStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import { NextResponse } from 'next/server';

import { getVerifiedSession } from '@/modules/auth/guards';
import { resolveStorageBrowserFile, type StorageBrowserKind } from '@/modules/settings/storage-browser-files';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Solo administradores' }, { status: 403 });
  }

  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');
  const relativePath = url.searchParams.get('path');

  if ((kind !== 'exports' && kind !== 'database') || !relativePath) {
    return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });
  }

  try {
    const { filePath, fileStat } = await resolveStorageBrowserFile(kind as StorageBrowserKind, relativePath);
    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
    const filename = path.basename(filePath).replace(/[^\x20-\x7E]/g, '_').replaceAll('"', '');

    return new Response(stream, {
      headers: {
        'Content-Length': String(fileStat.size),
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo descargar el archivo.' }, { status: 404 });
  }
}
