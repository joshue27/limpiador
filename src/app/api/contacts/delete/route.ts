import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import { getVerifiedSession } from '@/modules/auth/guards';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Solo un administrador puede eliminar contactos.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { id?: string } | null;
  if (!body?.id) {
    return NextResponse.json({ error: 'Falta el ID del contacto' }, { status: 400 });
  }

  const contact = await prisma.contact.findUnique({
    where: { id: body.id },
    select: { id: true, phone: true, displayName: true },
  });

  if (!contact) {
    return NextResponse.json({ error: 'Contacto no encontrado.' }, { status: 404 });
  }

  await prisma.contact.delete({ where: { id: body.id } });
  await writeAuditLog({
    userId: session.userId,
    action: AUDIT_ACTIONS.CONTACT_UPDATED,
    entityType: 'contact',
    entityId: body.id,
    metadata: { action: 'deleted', phone: contact.phone, displayName: contact.displayName },
  });

  return NextResponse.json({ ok: true });
}
