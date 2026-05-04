import { prisma } from '@/lib/prisma';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import type { AppSession } from '@/modules/auth/session';
import { sendAssignmentEmail } from '@/modules/email/sender';

import { canClaimConversation, canTransferConversation } from './access';

export async function claimConversation(conversationId: string, session: AppSession) {
  if (!(await canClaimConversation(session, conversationId))) return { ok: false as const, status: 403, error: 'No tiene permiso para tomar este chat.' };

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.conversation.updateMany({
      where: { id: conversationId, status: 'DEPARTMENT_QUEUE', assignedToId: null },
      data: { status: 'CLAIMED', assignedToId: session.userId },
    });
    if (updated.count !== 1) return { claimed: false };
    await tx.auditLog.create({
      data: { userId: session.userId, action: AUDIT_ACTIONS.INBOX_CLAIMED, entityType: 'conversation', entityId: conversationId },
    });
    return { claimed: true };
  });

  if (!result.claimed) return { ok: false as const, status: 409, error: 'Otro usuario ya tomó este chat.' };
  return { ok: true as const };
}

export async function transferConversation(
  conversationId: string,
  session: AppSession,
  input: { toDepartmentId?: string | null; toUserId?: string | null; reason?: string | null },
) {
  if (!(await canTransferConversation(session, conversationId))) return { ok: false as const, status: 403, error: 'No tiene permiso para transferir este chat.' };

  const toDepartmentId = input.toDepartmentId?.trim() || null;
  const toUserId = input.toUserId?.trim() || null;
  if (!toDepartmentId && !toUserId) return { ok: false as const, status: 400, error: 'Elegí un departamento o usuario destino.' };

  const [department, user] = await Promise.all([
    toDepartmentId ? prisma.department.findFirst({ where: { id: toDepartmentId, active: true } }) : Promise.resolve(null),
    toUserId
      ? prisma.user.findFirst({
          where: { id: toUserId, status: 'ACTIVE' },
          include: { departments: { select: { departmentId: true } } },
        })
      : Promise.resolve(null),
  ]);
  if (toDepartmentId && !department) return { ok: false as const, status: 400, error: 'El departamento destino no existe o está inactivo.' };
  if (toUserId && !user) return { ok: false as const, status: 400, error: 'El usuario destino no existe o está inactivo.' };
  if (toUserId && toDepartmentId && session.role !== 'ADMIN' && !user?.departments.some((membership) => membership.departmentId === toDepartmentId)) {
    return { ok: false as const, status: 400, error: 'El usuario destino no pertenece al departamento elegido.' };
  }

  const nextDepartmentId = toDepartmentId ?? (toUserId ? null : undefined);
  const nextStatus = toUserId ? 'CLAIMED' : 'DEPARTMENT_QUEUE';
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: nextStatus, assignedDepartmentId: nextDepartmentId, assignedToId: toUserId },
  });
  await writeAuditLog({
    userId: session.userId,
    action: AUDIT_ACTIONS.INBOX_TRANSFERRED,
    entityType: 'conversation',
    entityId: conversationId,
    metadata: { toDepartmentId, toUserId, reason: input.reason?.trim() || undefined },
  });

  // Send email notification if assigned to a specific user
  if (toUserId && user) {
    const contact = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { contact: { select: { displayName: true, phone: true } } },
    });
    const contactName = contact?.contact.displayName || contact?.contact.phone || 'un contacto';
    const userName = user.name || user.email;
    sendAssignmentEmail(user.email, userName, contactName).catch((error) => {
      console.error('[inbox/assignment] assignment email failed', error instanceof Error ? error.message : error);
    });
  }

  return { ok: true as const };
}
