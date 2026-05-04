'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import { requireSession } from '@/modules/auth/guards';
import { canViewConversation } from '@/modules/inbox/access';

export async function toggleArchivado(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get('id') ?? '');
  const nextValue = formData.get('isComprobante') === 'true';
  const confirmation = String(formData.get('confirmation') ?? '').trim().toUpperCase();
  if (!id) return;

  // Load the asset to check ownership and conversation access
  const asset = await prisma.mediaAsset.findUnique({
    where: { id },
    select: {
      id: true,
      isComprobante: true,
      markedById: true,
      message: { select: { conversationId: true } },
    },
  });

  if (!asset) return;

  if (!nextValue) {
    // UNMARK: only the user who marked it OR an ADMIN
    if (confirmation !== 'DESMARCAR') {
      await writeAuditLog({ userId: session.userId, action: AUDIT_ACTIONS.MEDIA_UNMARK_REJECTED, entityType: 'media_asset', entityId: id, metadata: { reason: 'missing_confirmation' } });
      return;
    }

    if (session.role !== 'ADMIN' && asset.markedById !== session.userId) {
      await writeAuditLog({ userId: session.userId, action: AUDIT_ACTIONS.MEDIA_UNMARK_REJECTED, entityType: 'media_asset', entityId: id, metadata: { reason: 'not_owner' } });
      return;
    }
  } else {
    // MARK: must be able to view the conversation (ADMINs bypass)
    if (session.role !== 'ADMIN') {
      const canView = await canViewConversation(session, asset.message.conversationId);
      if (!canView) {
        await writeAuditLog({ userId: session.userId, action: AUDIT_ACTIONS.MEDIA_UNMARK_REJECTED, entityType: 'media_asset', entityId: id, metadata: { reason: 'conversation_access_denied' } });
        return;
      }
    }
  }

  await prisma.mediaAsset.update({
    where: { id },
    data: { isComprobante: nextValue, markedById: nextValue ? session.userId : null, markedAt: nextValue ? new Date() : null },
  });
  await writeAuditLog({
    userId: session.userId,
    action: nextValue ? AUDIT_ACTIONS.MEDIA_MARKED_COMPROBANTE : AUDIT_ACTIONS.MEDIA_UNMARKED_COMPROBANTE,
    entityType: 'media_asset',
    entityId: id,
  });
  revalidatePath('/comprobantes');
}

export async function toggleInboxComprobante(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get('id') ?? '');
  const nextValue = formData.get('isComprobante') === 'true';
  if (!id) return;

  // Load the asset to get the conversation for access check
  const asset = await prisma.mediaAsset.findUnique({
    where: { id },
    select: {
      id: true,
      message: { select: { conversationId: true } },
    },
  });

  if (!asset) return;

  // Check conversation access (ADMINs bypass)
  if (session.role !== 'ADMIN') {
    const canView = await canViewConversation(session, asset.message.conversationId);
    if (!canView) {
      await writeAuditLog({ userId: session.userId, action: AUDIT_ACTIONS.MEDIA_UNMARK_REJECTED, entityType: 'media_asset', entityId: id, metadata: { reason: 'conversation_access_denied' } });
      return;
    }
  }

  await prisma.mediaAsset.update({
    where: { id },
    data: {
      isComprobante: nextValue,
      markedById: nextValue ? session.userId : null,
      markedAt: nextValue ? new Date() : null,
    },
  });
  await writeAuditLog({
    userId: session.userId,
    action: nextValue ? AUDIT_ACTIONS.MEDIA_MARKED_COMPROBANTE : AUDIT_ACTIONS.MEDIA_UNMARKED_COMPROBANTE,
    entityType: 'media_asset',
    entityId: id,
  });
  revalidatePath('/inbox');
  revalidatePath('/comprobantes');
}
