import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import { auditDeniedAccess, getVerifiedSession } from '@/modules/auth/guards';
import { auditConversationAccessDenied, canViewConversation } from '@/modules/inbox/access';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  const { id: conversationId, messageId } = await params;
  const session = await getVerifiedSession();

  if (!session) {
    await auditDeniedAccess({ request, session, entityType: 'message', entityId: messageId, reason: 'unauthenticated' });
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (!(await canViewConversation(session, conversationId))) {
    await auditConversationAccessDenied({ session, conversationId, reason: 'hide_message_forbidden' });
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { scope?: string } | null;
  const scope = body?.scope === 'everyone' ? 'everyone' : 'me';

  const message = await prisma.message.findFirst({
    where: { id: messageId, conversationId },
    select: { id: true, direction: true, type: true, body: true, caption: true },
  });

  if (!message) {
    return NextResponse.json({ error: 'Mensaje no encontrado' }, { status: 404 });
  }

  if (scope === 'everyone') {
    // Only admin or the message author (for outbound) can hide for everyone
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Solo un administrador puede eliminar para todos.' }, { status: 403 });
    }

    await prisma.message.update({
      where: { id: messageId },
      data: {
        hiddenGlobally: true,
        hiddenGloballyAt: new Date(),
        hiddenGloballyBy: session.userId,
      },
    });

    await writeAuditLog({
      userId: session.userId,
      action: AUDIT_ACTIONS.INBOX_MESSAGE_HIDDEN_EVERYONE,
      entityType: 'message',
      entityId: messageId,
      metadata: { wasDirection: message.direction, wasType: message.type, conversationId },
    });
  } else {
    // Hide for me
    await prisma.messageHide.upsert({
      where: { messageId_userId: { messageId, userId: session.userId } },
      create: { messageId, userId: session.userId },
      update: {},
    });

    await writeAuditLog({
      userId: session.userId,
      action: AUDIT_ACTIONS.INBOX_MESSAGE_HIDDEN_ME,
      entityType: 'message',
      entityId: messageId,
      metadata: { conversationId },
    });
  }

  return NextResponse.json({ ok: true, scope });
}
