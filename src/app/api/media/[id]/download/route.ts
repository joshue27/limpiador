import { NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import { privateFileResponse } from '@/lib/private-files';
import { checkApiRateLimit, clientIp, userAgent } from '@/lib/request';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import { auditDeniedAccess, getVerifiedSession } from '@/modules/auth/guards';
import { auditConversationAccessDenied, canViewConversation } from '@/modules/inbox/access';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getVerifiedSession();
  if (!session) {
    await auditDeniedAccess({ request, session, entityType: 'media_asset', entityId: id, reason: 'unauthenticated' });
    return NextResponse.json({ error: 'No tiene permiso para descargar este archivo.' }, { status: 401 });
  }

  const rate = await checkApiRateLimit(`media-download:${session.userId}`, request);
  if (!rate.allowed) {
    await writeAuditLog({
      userId: session.userId,
      action: AUDIT_ACTIONS.MEDIA_DOWNLOAD_RATE_LIMITED,
      entityType: 'media_asset',
      entityId: id,
      ipAddress: clientIp(request),
      userAgent: userAgent(request),
    });
    return NextResponse.json({ error: 'Too many download requests. Try again shortly.' }, { status: 429 });
  }

  const asset = await prisma.mediaAsset.findUnique({
    where: { id },
    include: { message: { select: { conversationId: true } } },
  });
  if (!asset?.storageKey || asset.downloadStatus !== 'READY') {
    await writeAuditLog({
      userId: session.userId,
      action: AUDIT_ACTIONS.MEDIA_DOWNLOAD_UNAVAILABLE,
      entityType: 'media_asset',
      entityId: id,
      ipAddress: clientIp(request),
      userAgent: userAgent(request),
    });
    return NextResponse.json({ error: 'File is not available yet' }, { status: 404 });
  }

  if (!(await canViewConversation(session, asset.message.conversationId))) {
    await auditConversationAccessDenied({
      session,
      conversationId: asset.message.conversationId,
      reason: 'media_download_forbidden',
    });
    return NextResponse.json({ error: 'No tiene permiso para descargar este archivo.' }, { status: 403 });
  }

  await writeAuditLog({
    userId: session.userId,
    action: AUDIT_ACTIONS.MEDIA_DOWNLOADED,
    entityType: 'media_asset',
    entityId: asset.id,
    ipAddress: clientIp(request),
    userAgent: userAgent(request),
  });
  return privateFileResponse(getConfig().storage.mediaRoot, asset.storageKey, asset.filename ?? `${asset.waMediaId}.bin`, asset.mimeType);
}
