import { Prisma, type MessageStatus, type MessageType } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { routeInboundTextMessage } from '@/modules/inbox/routing';
import { enqueueMediaDownload, enqueueWebhookEvent } from '@/modules/queue/queues';

type IncomingMessage = {
  id: string;
  from: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: MediaPayload;
  audio?: MediaPayload;
  document?: MediaPayload & { filename?: string };
  video?: MediaPayload;
  sticker?: MediaPayload;
  context?: { id?: string };
};

type MediaPayload = {
  id?: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
};

type IncomingStatus = {
  id: string;
  status: string;
  timestamp?: string;
  recipient_id?: string;
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function messageType(type: string | undefined): MessageType {
  switch (type) {
    case 'text': return 'TEXT';
    case 'image': return 'IMAGE';
    case 'audio': return 'AUDIO';
    case 'document': return 'DOCUMENT';
    case 'video': return 'VIDEO';
    case 'sticker': return 'STICKER';
    case 'template': return 'TEMPLATE';
    default: return 'UNKNOWN';
  }
}

function statusType(status: string | undefined): MessageStatus {
  switch (status) {
    case 'sent': return 'SENT';
    case 'delivered': return 'DELIVERED';
    case 'read': return 'READ';
    case 'failed': return 'FAILED';
    default: return 'PENDING';
  }
}

function timestampToDate(timestamp?: string) {
  const seconds = Number(timestamp);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date();
}

function getMedia(message: IncomingMessage): MediaPayload | undefined {
  if (message.type === 'image') return message.image;
  if (message.type === 'audio') return message.audio;
  if (message.type === 'document') return message.document;
  if (message.type === 'video') return message.video;
  if (message.type === 'sticker') return message.sticker;
  return undefined;
}

export async function ingestWhatsAppWebhook(payload: Record<string, unknown>) {
  const entries = asArray<{ changes?: Array<{ value?: Record<string, unknown> }> }>(payload.entry);
  let messagesProcessed = 0;
  let statusesProcessed = 0;
  let mediaQueued = 0;

  for (const entry of entries) {
    for (const change of asArray<{ value?: Record<string, unknown> }>(entry.changes)) {
      const value = change.value ?? {};
      const profileByWaId = new Map<string, string>();
      for (const contact of asArray<{ wa_id?: string; profile?: { name?: string } }>(value.contacts)) {
        if (contact.wa_id && contact.profile?.name) profileByWaId.set(contact.wa_id, contact.profile.name);
      }

      for (const message of asArray<IncomingMessage>(value.messages)) {
        if (!message.id || !message.from) continue;
        const existingMessage = await prisma.message.findUnique({ where: { wamid: message.id }, select: { id: true } });
        if (existingMessage) continue;

        const receivedAt = timestampToDate(message.timestamp);
        const media = getMedia(message);
        const previousContact = await prisma.contact.findUnique({
          where: { waId: message.from },
          select: { lastInboundAt: true },
        });
        const previousLastInboundAt = previousContact?.lastInboundAt ?? null;
        const contact = await prisma.contact.upsert({
          where: { waId: message.from },
          create: { waId: message.from, phone: message.from, displayName: profileByWaId.get(message.from), lastInboundAt: receivedAt },
          update: { displayName: profileByWaId.get(message.from), lastInboundAt: receivedAt },
        });
        const conversation = await prisma.conversation.upsert({
          where: { contactId: contact.id },
          create: { contactId: contact.id, lastMessageAt: receivedAt, unreadCount: 1 },
          update: { lastMessageAt: receivedAt, unreadCount: { increment: 1 } },
        });

        let rawJsonPayload: Record<string, unknown> = message as Record<string, unknown>;
        const replyToWamid = message.context?.id;

        if (replyToWamid) {
          const quoted = await prisma.message.findUnique({
            where: { wamid: replyToWamid },
            select: { id: true, wamid: true, direction: true, type: true, body: true, caption: true },
          });

          if (quoted) {
            rawJsonPayload = {
              ...rawJsonPayload,
              quotedMessageId: quoted.id,
              quotedWamid: quoted.wamid,
              quotedMessagePreview: {
                body: quoted.body,
                caption: quoted.caption,
                type: quoted.type,
                direction: quoted.direction,
              },
            };
          }
        }

        const saved = await prisma.message.upsert({
          where: { wamid: message.id },
          create: {
            wamid: message.id,
            contactId: contact.id,
            conversationId: conversation.id,
            direction: 'INBOUND',
            type: messageType(message.type),
            body: message.text?.body,
            caption: media?.caption,
            status: 'RECEIVED',
            receivedAt,
            rawJson: rawJsonPayload as Prisma.InputJsonValue,
          },
          update: {},
        });
        messagesProcessed += 1;

        if (media?.id) {
          const asset = await prisma.mediaAsset.upsert({
            where: { waMediaId: media.id },
            create: {
              messageId: saved.id,
              waMediaId: media.id,
              mimeType: media.mime_type ?? 'application/octet-stream',
              filename: message.document?.filename,
              sha256: media.sha256,
            },
            update: {},
          });
          try {
            await enqueueMediaDownload(asset.id);
            mediaQueued += 1;
          } catch (error) {
            await prisma.mediaAsset.update({ where: { id: asset.id }, data: { downloadError: error instanceof Error ? error.message : 'Queue unavailable' } });
          }
        }

        if (saved.type === 'TEXT' && saved.direction === 'INBOUND') {
          try {
            await routeInboundTextMessage({
              conversationId: conversation.id,
              contactWaId: contact.waId,
              inboundMessageId: saved.id,
              body: saved.body,
              previousLastInboundAt,
              receivedAt,
              assignedOperatorId: contact.assignedOperatorId,
            });
          } catch {
            // Ingestion must remain durable even if WhatsApp auto-reply or routing audit fails.
          }
        }

        try {
          await enqueueWebhookEvent('inbound-message', saved.id);
        } catch {
          // Durable DB write is the source of truth; queue can be retried by operators/workers later.
        }
      }

      for (const status of asArray<IncomingStatus>(value.statuses)) {
        if (!status.id) continue;
        const message = await prisma.message.findUnique({ where: { wamid: status.id } });
        if (!message) continue;
        const occurredAt = timestampToDate(status.timestamp);
        const nextStatus = statusType(status.status);
        await prisma.message.update({ where: { id: message.id }, data: { status: nextStatus } });
        const exists = await prisma.messageStatusEvent.findFirst({ where: { messageId: message.id, status: nextStatus, occurredAt } });
        if (!exists) {
          await prisma.messageStatusEvent.create({ data: { messageId: message.id, status: nextStatus, occurredAt, rawJson: status as Prisma.InputJsonValue } });
        }
        statusesProcessed += 1;

        // Reconcile campaign recipient status
        if (nextStatus === 'SENT' || nextStatus === 'DELIVERED' || nextStatus === 'READ' || nextStatus === 'FAILED') {
          const recipientStatus: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' =
            nextStatus === 'SENT' ? 'SENT' :
            nextStatus === 'READ' ? 'READ' :
            nextStatus === 'FAILED' ? 'FAILED' : 'DELIVERED';
          await prisma.campaignRecipient.updateMany({
            where: { wamid: status.id },
            data: { status: recipientStatus },
          });
        }
      }
    }
  }

  return { messagesProcessed, statusesProcessed, mediaQueued };
}
