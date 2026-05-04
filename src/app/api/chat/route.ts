import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getVerifiedSession } from '@/modules/auth/guards';
import { mergeUnreadCounts } from '@/modules/chat/read-status';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await getVerifiedSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const url = new URL(request.url);
  const withUser = url.searchParams.get('with');
  const now = new Date();
  const heartbeatCutoff = new Date(now.getTime() - 60 * 1000);

  const where = withUser
    ? {
        OR: [
          { userId: session.userId, recipientId: withUser },
          { userId: withUser, recipientId: session.userId },
        ],
      }
    : { recipientId: null }; // Group chat

  const [, messages] = await Promise.all([
    prisma.user.updateMany({
      where: {
        id: session.userId,
        OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: heartbeatCutoff } }],
      },
      data: { lastLoginAt: now },
    }).catch(() => ({ count: 0 })),
    prisma.internalMessage.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);

  // Mark DM messages from the other user as read
  if (withUser) {
    await prisma.internalMessage.updateMany({
      where: {
        userId: withUser,
        recipientId: session.userId,
        readAt: null,
      },
      data: { readAt: now },
    });
  } else {
    // General chat — mark all as read
    await prisma.internalMessage.updateMany({
      where: {
        recipientId: null,
        readAt: null,
        userId: { not: session.userId },
      },
      data: { readAt: now },
    });
  }

  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const [onlineUsers, users, unreadRows, generalUnread] = await Promise.all([
    prisma.user.findMany({
      where: { status: 'ACTIVE', lastLoginAt: { gte: fiveMinAgo } },
      select: { id: true },
    }),
    prisma.user.findMany({
      where: { status: 'ACTIVE', id: { not: session.userId } },
      select: {
        id: true, name: true, email: true, lastLoginAt: true,
        departments: { select: { department: { select: { name: true } } } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.internalMessage.groupBy({
      by: ['userId'],
      where: {
        recipientId: session.userId,
        readAt: null,
      },
      _count: { id: true },
    }),
    prisma.internalMessage.count({
      where: {
        recipientId: null,
        readAt: null,
        userId: { not: session.userId },
      },
    }),
  ]);
  const onlineIds = new Set(onlineUsers.map(u => u.id));

  const unreadCounts: Record<string, number> = {};
  for (const row of unreadRows) {
    unreadCounts[row.userId] = row._count.id;
  }

  const userList = mergeUnreadCounts(
    users.map(u => ({
      id: u.id,
      name: u.name || u.email,
      online: onlineIds.has(u.id),
      departments: u.departments.map(d => d.department.name),
    })),
    unreadCounts,
  );

  return NextResponse.json({
    messages: messages.reverse(),
    users: userList,
    currentUserId: session.userId,
    generalUnread,
  });
}

export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { body?: string; recipientId?: string | null } | null;
  const messageBody = body?.body?.trim();
  if (!messageBody) {
    return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 });
  }

  // Update lastLoginAt for online status heartbeat
  await prisma.user.update({
    where: { id: session.userId },
    data: { lastLoginAt: new Date() },
  });

  const msg = await prisma.internalMessage.create({
    data: {
      userId: session.userId,
      recipientId: body?.recipientId || null,
      body: messageBody,
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json(msg);
}
