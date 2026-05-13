import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getVerifiedSession } from '@/modules/auth/guards';
import { getUserDepartmentIds } from '@/modules/inbox/access';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getVerifiedSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  let queueCount = 0;
  let unreadCount = 0;
  let inboundMessageCount = 0;

  if (session.role === 'ADMIN') {
    queueCount = await prisma.conversation.count({
      where: { status: { in: ['UNASSIGNED', 'MENU_PENDING', 'DEPARTMENT_QUEUE'] } },
    });
    unreadCount =
      (await prisma.conversation.aggregate({ _sum: { unreadCount: true } }))._sum.unreadCount ?? 0;
    inboundMessageCount = await prisma.message.count({ where: { direction: 'INBOUND' } });
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
  }

  return NextResponse.json({
    queueCount,
    unreadCount,
    inboundMessageCount,
  });
}
