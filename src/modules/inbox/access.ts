import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import type { AppSession } from '@/modules/auth/session';

export type ConversationAccessSnapshot = {
  id: string;
  status: 'UNASSIGNED' | 'MENU_PENDING' | 'DEPARTMENT_QUEUE' | 'CLAIMED';
  assignedDepartmentId: string | null;
  assignedToId: string | null;
};

export async function getUserDepartmentIds(userId: string) {
  const memberships = await prisma.userDepartment.findMany({
    where: { userId, user: { status: 'ACTIVE' }, department: { active: true } },
    select: { departmentId: true },
  });
  return memberships.map((membership) => membership.departmentId);
}

export function canViewConversationSnapshot(
  session: AppSession,
  conversation: ConversationAccessSnapshot,
  departmentIds: string[],
) {
  if (session.role === 'ADMIN') return true;
  if (conversation.assignedToId) return conversation.assignedToId === session.userId;
  if (conversation.status === 'DEPARTMENT_QUEUE') {
    return Boolean(conversation.assignedDepartmentId && departmentIds.includes(conversation.assignedDepartmentId));
  }
  return false; // Operators can only see their own or department-queued conversations
}

export async function conversationListWhereForSession(session: AppSession): Promise<Prisma.ConversationWhereInput> {
  if (session.role === 'ADMIN') return {};
  const departmentIds = await getUserDepartmentIds(session.userId);
  return {
    OR: [
      { assignedToId: session.userId },
      { status: 'DEPARTMENT_QUEUE', assignedDepartmentId: { in: departmentIds } },
    ],
  };
}

export async function canViewConversation(session: AppSession, conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, status: true, assignedDepartmentId: true, assignedToId: true },
  });
  if (!conversation) return false;
  const departments = session.role === 'ADMIN' ? [] : await getUserDepartmentIds(session.userId);
  return canViewConversationSnapshot(session, conversation, departments);
}

export async function canClaimConversation(session: AppSession, conversationId: string) {
  if (session.role === 'ADMIN') return true;
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { status: true, assignedDepartmentId: true, assignedToId: true },
  });
  if (!conversation || conversation.status !== 'DEPARTMENT_QUEUE' || conversation.assignedToId) return false;
  const departments = await getUserDepartmentIds(session.userId);
  return Boolean(conversation.assignedDepartmentId && departments.includes(conversation.assignedDepartmentId));
}

export async function canTransferConversation(session: AppSession, conversationId: string) {
  if (session.role === 'ADMIN') return true;
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { status: true, assignedDepartmentId: true, assignedToId: true },
  });
  if (!conversation) return false;
  if (conversation.assignedToId === session.userId) return true;
  if (conversation.status !== 'DEPARTMENT_QUEUE' || !conversation.assignedDepartmentId) return false;
  const departments = await getUserDepartmentIds(session.userId);
  return departments.includes(conversation.assignedDepartmentId);
}

export async function auditConversationAccessDenied(input: { session?: AppSession | null; conversationId: string; reason: string }) {
  await writeAuditLog({
    userId: input.session?.userId,
    action: AUDIT_ACTIONS.INBOX_ACCESS_DENIED,
    entityType: 'conversation',
    entityId: input.conversationId,
    metadata: { reason: input.reason, role: input.session?.role },
  });
}
