import { NextResponse } from 'next/server';
import { safeRedirect } from '@/lib/safe-redirect';

import { prisma } from '@/lib/prisma';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import { getVerifiedSession } from '@/modules/auth/guards';
import { auditConversationAccessDenied, canViewConversation } from '@/modules/inbox/access';
import { validActiveControlledTagCodes } from '@/modules/tags/controlled-tags';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getVerifiedSession();
  if (!session) {
    await auditConversationAccessDenied({ conversationId: id, reason: 'unauthenticated' });
    return NextResponse.json({ error: 'No tiene permiso para editar etiquetas.' }, { status: 401 });
  }

  if (!(await canViewConversation(session, id))) {
    await auditConversationAccessDenied({ session, conversationId: id, reason: 'tags_update_forbidden' });
    return NextResponse.json({ error: 'No tiene permiso para editar etiquetas de este chat.' }, { status: 403 });
  }

  const contentType = request.headers.get('content-type') ?? '';
  let bodyTags: Array<FormDataEntryValue | string> = [];

  if (contentType.includes('application/json')) {
    const json = await request.json().catch(() => null) as { tags?: unknown } | null;
    bodyTags = Array.isArray(json?.tags) ? json.tags as Array<FormDataEntryValue | string> : [];
  } else {
    const formData = await request.formData().catch(() => null);
    bodyTags = formData ? formData.getAll('tags') : [];
  }

  const tags = await validActiveControlledTagCodes(bodyTags);
  const conversation = await prisma.conversation.findUnique({ where: { id }, select: { contactId: true } });
  if (!conversation) return NextResponse.json({ error: 'Conversación no encontrada.' }, { status: 404 });

  await prisma.contact.update({ where: { id: conversation.contactId }, data: { tags } });
  await writeAuditLog({
    userId: session.userId,
    action: AUDIT_ACTIONS.CONTACT_TAGS_UPDATED,
    entityType: 'contact',
    entityId: conversation.contactId,
    metadata: { conversationId: id, tags },
  });

  if (request.headers.get('accept')?.includes('application/json')) {
    return NextResponse.json({ ok: true, tags });
  }

  return NextResponse.redirect(safeRedirect(request, `/inbox?conversation=${id}`), { status: 303 });
}
