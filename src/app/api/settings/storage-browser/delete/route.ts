import { NextResponse } from 'next/server';

import { getVerifiedSession } from '@/modules/auth/guards';
import { deleteStorageBrowserFile, type StorageBrowserKind } from '@/modules/settings/storage-browser-files';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Solo administradores' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { kind?: string; path?: string } | null;
  const kind = body?.kind;
  const relativePath = body?.path;

  if ((kind !== 'exports' && kind !== 'database') || !relativePath) {
    return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });
  }

  try {
    await deleteStorageBrowserFile(kind as StorageBrowserKind, relativePath);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo eliminar el archivo.' }, { status: 400 });
  }
}
