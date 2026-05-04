import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import { getVerifiedSession } from '@/modules/auth/guards';
import { validActiveControlledTagCodes } from '@/modules/tags/controlled-tags';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as {
    id?: string;
    displayName?: string | null;
    phone?: string;
    tags?: string[];
    blocked?: boolean;
    unsubscribed?: boolean;
    optInSource?: string | null;
    assignedOperatorId?: string | null;
  } | null;

  if (!body?.id) {
    return NextResponse.json({ error: 'Falta el ID del contacto' }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.displayName !== undefined) data.displayName = body.displayName?.trim() || null;
  if (body.phone?.trim()) data.phone = body.phone.trim();
  if (body.tags) data.tags = await validActiveControlledTagCodes(body.tags);
  if (typeof body.blocked === 'boolean') data.blocked = body.blocked;
  if (typeof body.unsubscribed === 'boolean') data.unsubscribed = body.unsubscribed;
  if (body.optInSource !== undefined) data.optInSource = body.optInSource?.trim() || null;
  if (body.assignedOperatorId !== undefined) {
    if (body.assignedOperatorId) {
      const op = await prisma.user.findFirst({ where: { id: body.assignedOperatorId, status: 'ACTIVE' }, select: { id: true } });
      if (!op) return NextResponse.json({ error: 'Operador no encontrado o inactivo.' }, { status: 400 });
      data.assignedOperatorId = body.assignedOperatorId;
    } else {
      data.assignedOperatorId = null;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true });
  }

  await prisma.contact.update({ where: { id: body.id }, data });
  await writeAuditLog({
    userId: session.userId,
    action: AUDIT_ACTIONS.CONTACT_UPDATED,
    entityType: 'contact',
    entityId: body.id,
  });

  return NextResponse.json({ ok: true });
}
