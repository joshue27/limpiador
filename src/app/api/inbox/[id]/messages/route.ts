import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getVerifiedSession } from '@/modules/auth/guards';
import { auditConversationAccessDenied, canViewConversation } from '@/modules/inbox/access';
import {
  getSupportedConversationAttachment,
  sendConversationAttachmentMessage,
  sendConversationAttachmentMessages,
  sendConversationTemplateMessage,
  sendConversationTextMessage,
} from '@/modules/inbox/composer';
import {
  buildCursorWhere,
  decodeInboxCursor,
  encodeInboxCursor,
  validateInboxMessagesLimit,
} from '@/modules/inbox/cursor';
import type { QuotedMessageState } from '@/modules/inbox/message-history';
import { messageResponse } from '@/modules/inbox/message-response';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getVerifiedSession();

  if (!session) {
    await auditConversationAccessDenied({ conversationId: id, reason: 'unauthenticated' });
    return messageResponse(request, id, 'Tu sesión venció. Vuelva a ingresar para enviar mensajes.', 'error', 401);
  }

  if (!(await canViewConversation(session, id))) {
    await auditConversationAccessDenied({ session, conversationId: id, reason: 'send_message_forbidden' });
    return messageResponse(request, id, 'No tiene permiso para responder esta conversación.', 'error', 403);
  }

  const formData = await request.formData();
  const bodyEntry = formData.get('body');
  const templateKeyEntry = formData.get('templateKey');
  const quotedMessageIdEntry = formData.get('quotedMessageId');
  const retryMessageIdEntry = formData.get('retryMessageId');
  const body = typeof bodyEntry === 'string' ? bodyEntry : '';
  const templateKey = typeof templateKeyEntry === 'string' ? templateKeyEntry : '';
  const quotedMessageId = typeof quotedMessageIdEntry === 'string' ? quotedMessageIdEntry : undefined;
  const retryMessageId = typeof retryMessageIdEntry === 'string' ? retryMessageIdEntry : undefined;
  const attachments = formData.getAll('attachment').filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const attachment = attachments[0] ?? null;
  const hasAttachment = attachments.length > 0;
  const supportedAttachment = attachment ? getSupportedConversationAttachment(attachment) : null;
  const result = templateKey.trim()
    ? await sendConversationTemplateMessage({ conversationId: id, session, templateKey })
    : hasAttachment
      ? await sendConversationAttachmentMessages({ conversationId: id, session, files: attachments, caption: body })
      : await sendConversationTextMessage({ conversationId: id, session, body, quotedMessageId, retryMessageId });

  if (!result.ok) {
    const msg = 'message' in result ? (result as { message?: QuotedMessageState }).message : undefined;
    return messageResponse(request, id, result.notice, 'error', 400, msg);
  }

  const successMessage = 'message' in result ? (result as { message?: QuotedMessageState }).message : undefined;
  return messageResponse(
    request,
    id,
    templateKey.trim() ? 'Plantilla enviada.' : hasAttachment ? attachments.length > 1 ? 'Archivos enviados.' : supportedAttachment?.kind === 'image' ? 'Imagen enviada.' : 'Archivo enviado.' : 'Mensaje enviado.',
    'success',
    200,
    successMessage,
  );
}

type RawMessage = {
  id: string;
  direction: string;
  type: string;
  body: string | null;
  caption: string | null;
  status: string;
  createdAt: Date;
  mediaAssets: Array<{
    id: string;
    filename: string | null;
    mimeType: string;
    size: number | null;
    downloadStatus: string;
    isComprobante: boolean;
  }>;
  rawJson: unknown;
};

function formatMessageForApi(message: RawMessage): QuotedMessageState {
  return {
    id: message.id,
    direction: message.direction as QuotedMessageState['direction'],
    type: message.type as QuotedMessageState['type'],
    body: message.body,
    caption: message.caption,
    status: message.status as QuotedMessageState['status'],
    createdAt: message.createdAt.toISOString(),
    mediaAssets: message.mediaAssets.map((asset) => ({
      id: asset.id,
      filename: asset.filename,
      mimeType: asset.mimeType,
      size: asset.size ?? null,
      downloadStatus: asset.downloadStatus,
      isComprobante: asset.isComprobante,
    })),
    rawJson: message.rawJson,
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getVerifiedSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  if (!(await canViewConversation(session, id))) {
    await auditConversationAccessDenied({ session, conversationId: id, reason: 'read_messages_forbidden' });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const beforeParam = url.searchParams.get('before');
  const limitParam = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = validateInboxMessagesLimit(limitParam);

  let cursor = null;
  if (beforeParam) {
    cursor = decodeInboxCursor(beforeParam);
    if (!cursor) {
      return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
    }
  }

  const baseWhere = {
    conversationId: id,
    hiddenGlobally: false,
    hiddenByUsers: { none: { userId: session.userId } },
  };

  const where = buildCursorWhere(baseWhere, cursor);

  // Fetch limit + 1 to determine hasMore
  const messages = await prisma.message.findMany({
    where,
    include: { mediaAssets: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });

  const hasMore = messages.length > limit;
  const page = hasMore ? messages.slice(0, limit) : messages;

  // nextCursor is based on the oldest message in the returned page
  const oldestInPage = page[page.length - 1] ?? null;
  const nextCursor = hasMore && oldestInPage
    ? encodeInboxCursor(oldestInPage.createdAt, oldestInPage.id)
    : null;

  return NextResponse.json({
    messages: page.map(formatMessageForApi),
    nextCursor,
    hasMore,
  });
}
