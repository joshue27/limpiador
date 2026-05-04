import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getVerifiedSession } from '@/modules/auth/guards';
import { canViewConversation } from '@/modules/inbox/access';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getVerifiedSession();

  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (!(await canViewConversation(session, id))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    select: {
      id: true,
      updatedAt: true,
      lastMessageAt: true,
      unreadCount: true,
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, updatedAt: true, status: true },
      },
    },
  });

  if (!conversation) {
    return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });
  }

  const lastMessage = conversation.messages[0];

  return NextResponse.json({
    id: conversation.id,
    signature: [
      conversation.updatedAt.toISOString(),
      conversation.lastMessageAt?.toISOString() ?? '',
      conversation.unreadCount,
      lastMessage?.id ?? '',
      lastMessage?.updatedAt.toISOString() ?? '',
      lastMessage?.status ?? '',
    ].join('|'),
  });
}
