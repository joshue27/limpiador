import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getVerifiedSession } from '@/modules/auth/guards';
import { getUserDepartmentIds } from '@/modules/inbox/access';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await getVerifiedSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const sinceParam = new URL(request.url).searchParams.get('since');
  const sinceDate = sinceParam ? new Date(sinceParam) : null;
  const sinceFilter =
    sinceDate && !Number.isNaN(sinceDate.getTime()) ? { createdAt: { gte: sinceDate } } : {};

  let queueCount = 0;
  let unreadCount = 0;
  let inboundMessageCount = 0;
  let recentInboundMessages: Array<{
    id: string;
    conversationId: string;
    contactName: string;
    body: string | null;
    createdAt: string;
  }> = [];

  if (session.role === 'ADMIN') {
    queueCount = await prisma.conversation.count({
      where: { status: { in: ['UNASSIGNED', 'MENU_PENDING', 'DEPARTMENT_QUEUE'] } },
    });
    unreadCount =
      (await prisma.conversation.aggregate({ _sum: { unreadCount: true } }))._sum.unreadCount ?? 0;
    inboundMessageCount = await prisma.message.count({ where: { direction: 'INBOUND' } });
    recentInboundMessages = (
      await prisma.message.findMany({
        where: { direction: 'INBOUND', ...sinceFilter },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: sinceDate ? undefined : 10,
        select: {
          id: true,
          conversationId: true,
          body: true,
          caption: true,
          createdAt: true,
          contact: { select: { displayName: true, phone: true } },
        },
      })
    ).map((message) => ({
      id: message.id,
      conversationId: message.conversationId,
      contactName: message.contact.displayName || message.contact.phone,
      body: message.body || message.caption,
      createdAt: message.createdAt.toISOString(),
    }));
  } else {
    const departmentIds = await getUserDepartmentIds(session.userId);
    const accessibleConversationWhere = {
      OR: [
        { assignedToId: session.userId },
        { status: 'DEPARTMENT_QUEUE' as const, assignedDepartmentId: { in: departmentIds } },
      ],
    };

    queueCount = await prisma.conversation.count({
      where: {
        OR: [
          { assignedToId: session.userId, status: { in: ['DEPARTMENT_QUEUE', 'CLAIMED'] } },
          {
            status: 'DEPARTMENT_QUEUE',
            assignedDepartmentId: { in: departmentIds },
            assignedToId: null,
          },
        ],
      },
    });
    unreadCount =
      (
        await prisma.conversation.aggregate({
          _sum: { unreadCount: true },
          where: accessibleConversationWhere,
        })
      )._sum.unreadCount ?? 0;
    inboundMessageCount = await prisma.message.count({
      where: { direction: 'INBOUND', conversation: accessibleConversationWhere },
    });
    recentInboundMessages = (
      await prisma.message.findMany({
        where: { direction: 'INBOUND', conversation: accessibleConversationWhere, ...sinceFilter },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: sinceDate ? undefined : 10,
        select: {
          id: true,
          conversationId: true,
          body: true,
          caption: true,
          createdAt: true,
          contact: { select: { displayName: true, phone: true } },
        },
      })
    ).map((message) => ({
      id: message.id,
      conversationId: message.conversationId,
      contactName: message.contact.displayName || message.contact.phone,
      body: message.body || message.caption,
      createdAt: message.createdAt.toISOString(),
    }));
  }

  return NextResponse.json({
    queueCount,
    unreadCount,
    inboundMessageCount,
    recentInboundMessages,
  });
}
