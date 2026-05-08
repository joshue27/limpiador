import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import { auditDeniedAccess, getVerifiedSession } from '@/modules/auth/guards';
import { auditConversationAccessDenied, canViewConversation } from '@/modules/inbox/access';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getVerifiedSession();

  if (!session) {
    await auditDeniedAccess({ request, session, entityType: 'media_asset', entityId: id, reason: 'unauthenticated' });
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const asset = await prisma.mediaAsset.findUnique({
    where: { id },
    include: { message: { select: { conversationId: true } } },
  });

  if (!asset) {
    return NextResponse.json({ error: 'Adjunto no encontrado' }, { status: 404 });
  }

  if (!(await canViewConversation(session, asset.message.conversationId))) {
    await auditConversationAccessDenied({ session, conversationId: asset.message.conversationId, reason: 'mark_comprobante_forbidden' });
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { isComprobante?: unknown } | null;
  const nextValue = body?.isComprobante === true;

  // Only ADMIN or the operator who marked it can unmark
  if (!nextValue && session.role !== 'ADMIN' && asset.markedById !== session.userId) {
    await writeAuditLog({
      userId: session.userId,
      action: AUDIT_ACTIONS.MEDIA_UNMARK_REJECTED,
      entityType: 'media_asset',
      entityId: id,
      metadata: { reason: 'not_owner' },
    });
    return NextResponse.json({ error: 'No autorizado para desmarcar este comprobante' }, { status: 403 });
  }

  const updated = await prisma.mediaAsset.update({
    where: { id },
    data: {
      isComprobante: nextValue,
      markedById: nextValue ? session.userId : null,
      markedAt: nextValue ? new Date() : null,
    },
    select: { id: true, isComprobante: true },
  });

  await writeAuditLog({
    userId: session.userId,
    action: nextValue ? AUDIT_ACTIONS.MEDIA_MARKED_COMPROBANTE : AUDIT_ACTIONS.MEDIA_UNMARKED_COMPROBANTE,
    entityType: 'media_asset',
    entityId: id,
  });

  return NextResponse.json({ ok: true, mediaAsset: updated });
}
