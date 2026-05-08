import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getVerifiedSession } from '@/modules/auth/guards';
import { getRestoreRunStatus } from '@/modules/restore/restore-job';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }

  const { id } = await params;
  const status = await getRestoreRunStatus(prisma, id);
  if (!status) {
    return NextResponse.json({ error: 'Restauración no encontrada' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
}
