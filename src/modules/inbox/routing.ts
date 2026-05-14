import { Prisma } from '@prisma/client';
import { readFile } from 'node:fs/promises';

import { settingsFilePath } from '@/lib/settings-files';
import { prisma } from '@/lib/prisma';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import { createWhatsAppCloudClient } from '@/modules/whatsapp/client';
import { whatsappWindowMs } from '@/modules/whatsapp/window';

import { departmentByMenuNumber } from './departments';

const SETTINGS_FILE = settingsFilePath('routing-menu.txt');

const DEFAULT_MENU = `Hola 👋 ¿Con qué área quiere comunicarse?

1. Atención al Estudiante
2. Contabilidad
3. Coordinación Académica
4. Ventas
5. Informática

Responda con el número del área.`;

async function getRoutingMenuText(): Promise<string> {
  try {
    return await readFile(SETTINGS_FILE, 'utf-8');
  } catch {
    return DEFAULT_MENU;
  }
}

export let ROUTING_MENU_TEXT = DEFAULT_MENU;

// Initialize on module load
getRoutingMenuText().then((text) => {
  ROUTING_MENU_TEXT = text;
});

export function isConversationClosedForRouting(
  previousWindowOpenedAt: Date | null,
  nextInboundAt: Date,
) {
  if (!previousWindowOpenedAt) return false;

  return previousWindowOpenedAt.getTime() + whatsappWindowMs <= nextInboundAt.getTime();
}

export async function parseRoutingMenuReply(body: string | null | undefined) {
  const trimmed = body?.trim() ?? '';
  if (!/^\d+$/.test(trimmed)) return null;
  const number = Number(trimmed);
  return departmentByMenuNumber(number);
}

export async function routeInboundTextMessage(input: {
  conversationId: string;
  contactWaId: string;
  inboundMessageId: string;
  body?: string | null;
  previousWindowOpenedAt?: Date | null;
  previousWindowOpenedBy?: 'INBOUND' | 'TEMPLATE' | null;
  receivedAt?: Date;
  assignedOperatorId?: string | null;
}) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    select: { id: true, status: true, assignedDepartmentId: true, assignedToId: true },
  });
  if (!conversation) return { routed: false as const, reason: 'missing_conversation' };

  // If the contact has an assigned operator, route directly to them
  if (
    input.assignedOperatorId &&
    !conversation.assignedDepartmentId &&
    !conversation.assignedToId
  ) {
    const operator = await prisma.user.findFirst({
      where: { id: input.assignedOperatorId, status: 'ACTIVE' },
      select: { id: true, departments: { select: { departmentId: true } } },
    });

    if (operator?.departments.length) {
      const departmentId = operator.departments[0].departmentId;
      await prisma.conversation.update({
        where: { id: input.conversationId },
        data: { status: 'CLAIMED', assignedDepartmentId: departmentId, assignedToId: operator.id },
      });
      await writeAuditLog({
        action: AUDIT_ACTIONS.INBOX_DEPARTMENT_ASSIGNED,
        entityType: 'conversation',
        entityId: input.conversationId,
        metadata: {
          departmentId,
          assignedToId: operator.id,
          reason: 'contact_owner',
          inboundMessageId: input.inboundMessageId,
        },
      });
      return {
        routed: true as const,
        action: 'contact_owner_assigned' as const,
        departmentId,
        assignedToId: operator.id,
      };
    }
  }

  const inboundAt = input.receivedAt ?? new Date();
  const shouldStartNewRoutingCycle = isConversationClosedForRouting(
    input.previousWindowOpenedAt ?? null,
    inboundAt,
  );

  if (
    shouldStartNewRoutingCycle &&
    (conversation.assignedDepartmentId ||
      conversation.assignedToId ||
      conversation.status === 'CLAIMED' ||
      conversation.status === 'DEPARTMENT_QUEUE')
  ) {
    await prisma.conversation.update({
      where: { id: input.conversationId },
      data: { status: 'UNASSIGNED', assignedDepartmentId: null, assignedToId: null },
    });
    await writeAuditLog({
      action: AUDIT_ACTIONS.INBOX_MENU_SENT,
      entityType: 'conversation',
      entityId: input.conversationId,
      metadata: {
        reason: 'closed_conversation_reopened',
        inboundMessageId: input.inboundMessageId,
        previousWindowOpenedAt: input.previousWindowOpenedAt?.toISOString() ?? null,
      },
    });
    await sendRoutingMenu(input.conversationId, input.contactWaId, { newCycle: true });
    return { routed: true as const, action: 'menu_sent_new_cycle' as const };
  }

  if (conversation.assignedDepartmentId || conversation.assignedToId)
    return { routed: false as const, reason: 'already_assigned' };

  if (conversation.status === 'UNASSIGNED') {
    if (input.previousWindowOpenedBy === 'TEMPLATE' && !shouldStartNewRoutingCycle) {
      return { routed: false as const, reason: 'template_window_active' };
    }

    await sendRoutingMenu(input.conversationId, input.contactWaId);
    return { routed: true as const, action: 'menu_sent' as const };
  }

  if (conversation.status !== 'MENU_PENDING')
    return { routed: false as const, reason: 'not_pending' };

  const selected = await parseRoutingMenuReply(input.body);
  if (!selected) {
    await writeAuditLog({
      action: AUDIT_ACTIONS.INBOX_INVALID_MENU_REPLY,
      entityType: 'conversation',
      entityId: input.conversationId,
      metadata: { inboundMessageId: input.inboundMessageId, body: input.body },
    });
    await sendRoutingMenu(input.conversationId, input.contactWaId, { invalidReply: true });
    return { routed: true as const, action: 'invalid_reply' as const };
  }

  const department = await prisma.department.findUnique({ where: { code: selected.code } });
  if (!department?.active) {
    await writeAuditLog({
      action: AUDIT_ACTIONS.INBOX_INVALID_MENU_REPLY,
      entityType: 'conversation',
      entityId: input.conversationId,
      metadata: {
        inboundMessageId: input.inboundMessageId,
        selected: selected.code,
        reason: 'department_inactive_or_missing',
      },
    });
    return { routed: true as const, action: 'invalid_reply' as const };
  }

  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { status: 'DEPARTMENT_QUEUE', assignedDepartmentId: department.id, assignedToId: null },
  });
  await writeAuditLog({
    action: AUDIT_ACTIONS.INBOX_DEPARTMENT_ASSIGNED,
    entityType: 'conversation',
    entityId: input.conversationId,
    metadata: {
      departmentId: department.id,
      departmentCode: department.code,
      inboundMessageId: input.inboundMessageId,
    },
  });
  return {
    routed: true as const,
    action: 'department_assigned' as const,
    departmentId: department.id,
  };
}

async function sendRoutingMenu(
  conversationId: string,
  contactWaId: string,
  options: { invalidReply?: boolean; newCycle?: boolean } = {},
) {
  const body = options.invalidReply
    ? `No pude reconocer esa opción.\n\n${ROUTING_MENU_TEXT}`
    : ROUTING_MENU_TEXT;
  const response = await createWhatsAppCloudClient().sendText({ to: contactWaId, body });
  const wamid = response.messages?.[0]?.id;
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: 'MENU_PENDING' },
  });
  await prisma.message.create({
    data: {
      wamid,
      conversation: { connect: { id: conversationId } },
      contact: { connect: { waId: contactWaId } },
      direction: 'OUTBOUND',
      type: 'TEXT',
      body,
      status: 'SENT',
      sentAt: new Date(),
      rawJson: response as Prisma.InputJsonValue,
    },
  });
  await writeAuditLog({
    action: AUDIT_ACTIONS.INBOX_MENU_SENT,
    entityType: 'conversation',
    entityId: conversationId,
    metadata: {
      invalidReply: options.invalidReply ?? false,
      newCycle: options.newCycle ?? false,
      wamid,
    },
  });
}
