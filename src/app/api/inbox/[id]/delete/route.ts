import { NextResponse } from 'next/server';
import { unlink } from 'node:fs/promises';
import path from 'node:path';

import { getConfig } from '@/lib/config';
import { logger, serializeError } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { safeRedirect } from '@/lib/safe-redirect';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import { requireSession, requireRole } from '@/modules/auth/guards';
import { canViewConversation } from '@/modules/inbox/access';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await params;
  const session = await requireSession();
  await requireRole(['ADMIN']); // Only admins can delete conversations

  // Verify the conversation exists and user can view it (though ADMIN can view all)
  const canView = await canViewConversation(session, conversationId);
  if (!canView) {
    return NextResponse.json(
      { error: 'Conversación no encontrada o acceso denegado.' },
      { status: 404 },
    );
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      contact: {
        select: { id: true, waId: true, displayName: true, phone: true },
      },
      messages: {
        select: { id: true },
      },
    },
  });

  if (!conversation) {
    return NextResponse.json({ error: 'Conversación no encontrada.' }, { status: 404 });
  }

  // Get form data for confirmation
  const formData = await request.formData();
  const confirmation = formData.get('confirmation')?.toString().trim();

  // Require explicit confirmation text
  if (confirmation !== 'ELIMINAR') {
    return NextResponse.json(
      {
        error:
          'Se requiere confirmación explícita. Escriba "ELIMINAR" para confirmar la eliminación.',
      },
      { status: 400 },
    );
  }

  try {
    // Fetch media assets to clean up files from disk
    const mediaAssets = prisma.mediaAsset
      ? await prisma.mediaAsset.findMany({
          where: { message: { conversationId } },
          select: { id: true, storageKey: true },
        })
      : [];
    const mediaRoot = getConfig().storage.mediaRoot;

    // Delete the conversation (cascades will delete messages and media assets from DB)
    await prisma.conversation.delete({
      where: { id: conversationId },
    });

    // Delete media files from disk
    for (const asset of mediaAssets) {
      if (asset.storageKey) {
        await unlink(path.join(mediaRoot, asset.storageKey)).catch(() => {});
      }
    }

    // Write audit log
    await writeAuditLog({
      userId: session.userId,
      action: AUDIT_ACTIONS.INBOX_CONVERSATION_DELETED,
      entityType: 'conversation',
      entityId: conversationId,
      metadata: {
        contactId: conversation.contact.id,
        contactWaId: conversation.contact.waId,
        contactDisplayName: conversation.contact.displayName,
        contactPhone: conversation.contact.phone,
        messageCount: conversation.messages.length,
        deletedByAdmin: true,
      },
    });

    // Redirect to inbox after deletion
    return NextResponse.redirect(safeRedirect(request, '/inbox'), { status: 303 });
  } catch (error) {
    logger.error('conversation_delete_failed', {
      err: serializeError(error),
      conversationId,
      userId: session.userId,
      messageCount: conversation.messages.length,
    });
    return NextResponse.json(
      { error: 'Error interno al eliminar la conversación.' },
      { status: 500 },
    );
  }
}
