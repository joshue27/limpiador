import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { auditDeniedAccess, getVerifiedSession } from '@/modules/auth/guards';
import { auditConversationAccessDenied, canViewConversation } from '@/modules/inbox/access';
import { enqueueMediaDownload } from '@/modules/queue/queues';

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
    await auditConversationAccessDenied({
      session,
      conversationId: asset.message.conversationId,
      reason: 'media_retry_forbidden',
    });
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  await prisma.mediaAsset.update({
    where: { id },
    data: {
      downloadStatus: 'PENDING',
      downloadError: null,
    },
  });

  await enqueueMediaDownload(id);

  return NextResponse.json({ ok: true });
}
