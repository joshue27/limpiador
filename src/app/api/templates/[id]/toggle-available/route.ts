import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/modules/auth/guards';

export const runtime = 'nodejs';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission('templates');

  const template = await prisma.messageTemplate.findUnique({
    where: { id },
    select: { id: true, available: true },
  });

  if (!template) {
    return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 });
  }

  const updated = await prisma.messageTemplate.update({
    where: { id },
    data: { available: !template.available },
    select: { id: true, available: true },
  });

  return NextResponse.json({ ok: true, available: updated.available });
}
