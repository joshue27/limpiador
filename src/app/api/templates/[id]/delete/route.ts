import { NextResponse } from 'next/server';
import { safeRedirect } from '@/lib/safe-redirect';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { getVerifiedSession } from '@/modules/auth/guards';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Solo un administrador puede eliminar plantillas.' }, { status: 403 });
  }

  const template = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!template) {
    return NextResponse.json({ error: 'Plantilla no encontrada.' }, { status: 404 });
  }

  await prisma.messageTemplate.delete({ where: { id } });
  revalidatePath('/templates');
  return NextResponse.redirect(safeRedirect(request, '/templates'), { status: 303 });
}
