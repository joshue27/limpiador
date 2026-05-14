import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import type { MessageStatus } from '@prisma/client';

import { getConfig } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import { safeMediaStorageKey, sha256Hex, writePrivateMedia } from '@/modules/media/storage';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import type { AppSession } from '@/modules/auth/session';
import { createWhatsAppCloudClient } from '@/modules/whatsapp/client';
import {
  getWindowOpenedAt,
  getWindowOpenedBy,
  resolveWindowState,
} from '@/modules/whatsapp/window';
import type { QuotedMessageState } from '@/modules/inbox/message-history';

export type ConversationComposerState = {
  mode: 'free_text' | 'template_only';
  canSendFreeText: boolean;
  notice: string;
  placeholder: string;
};

export type ConversationOpeningTemplateOption = {
  key: string;
  label: string;
  name: string;
  languageCode: string;
};

type ConversationTemplateSeed = {
  templateName: string;
  templateLanguage: string;
};

type ConversationTemplateRecord = {
  name: string;
  languageCode: string;
  body?: string | null;
};

function renderTemplateBody(body: string | null | undefined, values: string[] = []) {
  const source = body?.trim();
  if (!source) return '';
  return source.replace(/\{\{(\d+)\}\}/g, (_match, rawIndex) => {
    const index = Number(rawIndex) - 1;
    return values[index] ?? `{{${rawIndex}}}`;
  });
}

function buildConversationTemplateKey(name: string, languageCode: string) {
  return `${name}::${languageCode}`;
}

export function parseConversationTemplateKey(value: string) {
  const [name, languageCode, ...rest] = value.split('::');
  if (!name || !languageCode || rest.length > 0) return null;
  return { name, languageCode };
}

export function getConversationOpeningTemplateOptions(
  seeds: ConversationTemplateSeed[],
): ConversationOpeningTemplateOption[] {
  const unique = new Map<string, ConversationOpeningTemplateOption>();

  for (const seed of seeds) {
    const name = seed.templateName.trim();
    const languageCode = seed.templateLanguage.trim();
    if (!name || !languageCode) continue;

    const key = buildConversationTemplateKey(name, languageCode);
    if (unique.has(key)) continue;

    unique.set(key, {
      key,
      label: `${name} · ${languageCode}`,
      name,
      languageCode,
    });
  }

  return Array.from(unique.values()).sort(
    (left, right) =>
      left.name.localeCompare(right.name, 'es') ||
      left.languageCode.localeCompare(right.languageCode, 'es'),
  );
}

export function getConversationComposerState(
  windowOpenedAt: Date | null,
  now = new Date(),
): ConversationComposerState {
  if (getConfig().whatsappWindowBypass) {
    return {
      mode: 'free_text',
      canSendFreeText: true,
      notice: '[DEV] Ventana de 24h ignorada por WHATSAPP_WINDOW_BYPASS.',
      placeholder: 'Escribí una respuesta breve…',
    };
  }

  if (!windowOpenedAt) {
    return {
      mode: 'template_only',
      canSendFreeText: false,
      notice:
        'Todavía no podés enviar texto libre: no hay una apertura registrada de la ventana de 24 horas.',
      placeholder:
        'Cuando entre un mensaje o envíes una plantilla aprobada, vas a poder continuar desde acá.',
    };
  }

  if (windowOpenedAt.getTime() + 24 * 60 * 60 * 1000 <= now.getTime()) {
    return {
      mode: 'template_only',
      canSendFreeText: false,
      notice:
        'La ventana de 24 horas está cerrada. Prepará una plantilla para retomar la conversación.',
      placeholder:
        'La respuesta libre está bloqueada. Próximo paso: enviar una plantilla aprobada.',
    };
  }

  return {
    mode: 'free_text',
    canSendFreeText: true,
    notice: 'Podés responder con texto libre mientras la ventana de 24 horas siga activa.',
    placeholder: 'Escribí una respuesta breve…',
  };
}

type ConversationRecord = {
  id: string;
  contact: {
    id: string;
    waId: string;
    lastInboundAt: Date | null;
    lastWindowOpenedAt?: Date | null;
    lastWindowOpenedBy?: string | null;
  };
};

type PersistedTextMessageRow = {
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
    downloadStatus: string;
    isComprobante: boolean;
  }>;
  rawJson: unknown;
};

function toQuotedMessageState(row: PersistedTextMessageRow): QuotedMessageState {
  return {
    id: row.id,
    direction: row.direction as QuotedMessageState['direction'],
    type: row.type as QuotedMessageState['type'],
    body: row.body,
    caption: row.caption,
    status: row.status as QuotedMessageState['status'],
    createdAt: row.createdAt.toISOString(),
    mediaAssets: row.mediaAssets.map((asset) => ({
      id: asset.id,
      filename: asset.filename,
      mimeType: asset.mimeType,
      size: (asset as { size?: number | null }).size ?? null,
      downloadStatus: asset.downloadStatus,
      isComprobante: asset.isComprobante,
    })),
    rawJson: row.rawJson,
  };
}

type SendConversationTextMessageInput = {
  conversationId: string;
  session: AppSession;
  body: string;
  quotedMessageId?: string;
  retryMessageId?: string;
};

type SendConversationTextMessageDeps = {
  findConversation: (conversationId: string) => Promise<ConversationRecord | null>;
  findQuotedMessage: (input: { conversationId: string; messageId: string }) => Promise<{
    id: string;
    wamid: string | null;
    direction: 'INBOUND' | 'OUTBOUND';
    type: string;
    body: string | null;
    caption: string | null;
  } | null>;
  findRetryMessage?: (input: { conversationId: string; messageId: string }) => Promise<{
    id: string;
    body: string | null;
    rawJson: unknown;
    status: 'FAILED' | 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'RECEIVED';
    direction: 'INBOUND' | 'OUTBOUND';
    type: string;
  } | null>;
  sendText: (input: {
    to: string;
    body: string;
    context?: { message_id: string };
  }) => Promise<{ messages?: Array<{ id?: string }> } & Record<string, unknown>>;
  updateConversation: (input: { id: string; lastMessageAt: Date }) => Promise<unknown>;
  createMessage: (input: {
    wamid?: string;
    conversationId: string;
    contactId: string;
    body: string;
    sentAt: Date;
    rawJson: Record<string, unknown>;
    status?: string;
  }) => Promise<PersistedTextMessageRow>;
  updateMessage?: (input: {
    id: string;
    wamid?: string;
    body: string;
    sentAt: Date;
    rawJson: Record<string, unknown>;
    status: string;
  }) => Promise<PersistedTextMessageRow>;
  writeAuditLog: (input: {
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata: { wamid?: string; bodyLength: number };
  }) => Promise<unknown>;
  now: () => Date;
};

type SendConversationTemplateMessageInput = {
  conversationId: string;
  session: AppSession;
  templateKey: string;
};

type SendConversationDocumentMessageInput = {
  conversationId: string;
  session: AppSession;
  file: File;
  caption: string;
};

type SendConversationAttachmentMessagesInput = {
  conversationId: string;
  session: AppSession;
  files: File[];
  caption: string;
};

export type SupportedConversationAttachment = {
  kind: 'document' | 'image';
  messageType: 'DOCUMENT' | 'IMAGE';
  sendMediaType: 'document' | 'image';
  mimeType: string;
  filename: string;
};

type SendConversationTemplateMessageDeps = {
  findConversation: (conversationId: string) => Promise<ConversationRecord | null>;
  listTemplates: () => Promise<ConversationTemplateRecord[]>;
  sendTemplate: (input: {
    to: string;
    templateName: string;
    languageCode: string;
  }) => Promise<{ messages?: Array<{ id?: string }> } & Record<string, unknown>>;
  updateConversation: (input: { id: string; lastMessageAt: Date }) => Promise<unknown>;
  updateContactWindow: (input: {
    contactId: string;
    openedAt: Date;
    openedBy: 'INBOUND' | 'TEMPLATE';
  }) => Promise<unknown>;
  createMessage: (input: {
    wamid?: string;
    conversationId: string;
    contactId: string;
    body: string;
    sentAt: Date;
    rawJson: Record<string, unknown>;
  }) => Promise<unknown>;
  writeAuditLog: (input: {
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata: { wamid?: string; templateName: string; languageCode: string };
  }) => Promise<unknown>;
  now: () => Date;
};

type PersistConversationDocumentMessageInput = {
  conversationId: string;
  contactId: string;
  wamid?: string;
  messageType: 'DOCUMENT' | 'IMAGE';
  body: string | null;
  caption: string | null;
  sentAt: Date;
  rawJson: Record<string, unknown>;
  mediaId: string;
  mimeType: string;
  filename: string;
  size: number;
  bytes: Buffer;
};

type SendConversationDocumentMessageDeps = {
  findConversation: (conversationId: string) => Promise<ConversationRecord | null>;
  uploadMedia: (input: {
    file: File;
    filename: string;
    mimeType: string;
  }) => Promise<{ id: string }>;
  sendMedia: (input: {
    to: string;
    type: 'document' | 'image';
    mediaId: string;
    filename: string;
    caption?: string;
  }) => Promise<{ messages?: Array<{ id?: string }> } & Record<string, unknown>>;
  persistAttachmentMessage: (
    input: PersistConversationDocumentMessageInput,
  ) => Promise<QuotedMessageState | void>;
  writeAuditLog: (input: {
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata: { wamid?: string; mediaId: string; filename: string; mimeType: string; size: number };
  }) => Promise<unknown>;
  now: () => Date;
};

type SendConversationDocumentCompatDeps = {
  findConversation: SendConversationDocumentMessageDeps['findConversation'];
  uploadDocument: SendConversationDocumentMessageDeps['uploadMedia'];
  sendDocument: (input: {
    to: string;
    mediaId: string;
    filename: string;
    caption?: string;
  }) => Promise<{ messages?: Array<{ id?: string }> } & Record<string, unknown>>;
  persistDocumentMessage: SendConversationDocumentMessageDeps['persistAttachmentMessage'];
  writeAuditLog: SendConversationDocumentMessageDeps['writeAuditLog'];
  now: SendConversationDocumentMessageDeps['now'];
};

export type SendConversationTextMessageResult =
  | { ok: true; blockedReason: null; message: QuotedMessageState }
  | { ok: false; blockedReason: 'empty_body' | 'not_found' | 'template_only'; notice: string }
  | { ok: false; blockedReason: 'send_failed'; notice: string; message?: QuotedMessageState };

export type SendConversationTemplateMessageResult =
  | { ok: true; blockedReason: null }
  | {
      ok: false;
      blockedReason: 'missing_template' | 'not_found' | 'template_unavailable';
      notice: string;
    };

export type SendConversationDocumentMessageResult =
  | { ok: true; blockedReason: null; message?: QuotedMessageState }
  | {
      ok: false;
      blockedReason: 'missing_file' | 'not_found' | 'template_only' | 'unsupported_type';
      notice: string;
      message?: QuotedMessageState;
    };

export type SendConversationAttachmentMessageResult = SendConversationDocumentMessageResult;

export type SendConversationAttachmentMessagesResult =
  | { ok: true; blockedReason: null; sentCount: number; message?: QuotedMessageState }
  | {
      ok: false;
      blockedReason: 'missing_file' | 'not_found' | 'template_only' | 'unsupported_type';
      notice: string;
      message?: QuotedMessageState;
    };

function defaultDeps(): SendConversationTextMessageDeps {
  return {
    findConversation: (conversationId) =>
      prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
          id: true,
          contact: {
            select: {
              id: true,
              waId: true,
              lastInboundAt: true,
              lastWindowOpenedAt: true,
              lastWindowOpenedBy: true,
            },
          },
        },
      }),
    findQuotedMessage: ({ conversationId, messageId }) =>
      prisma.message.findFirst({
        where: { id: messageId, conversationId },
        select: { id: true, wamid: true, direction: true, type: true, body: true, caption: true },
      }),
    findRetryMessage: ({ conversationId, messageId }) =>
      prisma.message.findFirst({
        where: { id: messageId, conversationId },
        select: { id: true, body: true, rawJson: true, status: true, direction: true, type: true },
      }),
    sendText: (input) => createWhatsAppCloudClient().sendText(input),
    updateConversation: ({ id, lastMessageAt }) =>
      prisma.conversation.update({ where: { id }, data: { lastMessageAt } }),
    createMessage: ({ wamid, conversationId, contactId, body, sentAt, rawJson, status }) =>
      prisma.message.create({
        data: {
          wamid,
          conversationId,
          contactId,
          direction: 'OUTBOUND',
          type: 'TEXT',
          body,
          status: (status as MessageStatus) ?? 'SENT',
          sentAt,
          rawJson: rawJson as Prisma.InputJsonValue,
        },
        include: { mediaAssets: true },
      }) as unknown as Promise<PersistedTextMessageRow>,
    updateMessage: ({ id, wamid, body, sentAt, rawJson, status }) =>
      prisma.message.update({
        where: { id },
        data: {
          wamid,
          body,
          status: status as MessageStatus,
          sentAt,
          rawJson: rawJson as Prisma.InputJsonValue,
        },
        include: { mediaAssets: true },
      }) as unknown as Promise<PersistedTextMessageRow>,
    writeAuditLog: (input) => writeAuditLog(input),
    now: () => new Date(),
  };
}

function defaultTemplateDeps(): SendConversationTemplateMessageDeps {
  return {
    findConversation: (conversationId) =>
      prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
          id: true,
          contact: {
            select: {
              id: true,
              waId: true,
              lastInboundAt: true,
              lastWindowOpenedAt: true,
              lastWindowOpenedBy: true,
            },
          },
        },
      }),
    listTemplates: async () => {
      const templates = await prisma.messageTemplate.findMany({
        where: { status: 'APPROVED' },
        select: { name: true, language: true, body: true },
        orderBy: [{ name: 'asc' }, { language: 'asc' }],
      });

      return templates.map((template) => ({
        name: template.name,
        languageCode: template.language,
        body: template.body,
      }));
    },
    sendTemplate: (input) => createWhatsAppCloudClient().sendTemplate(input),
    updateConversation: ({ id, lastMessageAt }) =>
      prisma.conversation.update({ where: { id }, data: { lastMessageAt } }),
    updateContactWindow: ({ contactId, openedAt, openedBy }) =>
      prisma.contact.update({
        where: { id: contactId },
        data: { lastWindowOpenedAt: openedAt, lastWindowOpenedBy: openedBy },
      }),
    createMessage: ({ wamid, conversationId, contactId, body, sentAt, rawJson }) =>
      prisma.message.create({
        data: {
          wamid,
          conversationId,
          contactId,
          direction: 'OUTBOUND',
          type: 'TEMPLATE',
          body,
          status: 'SENT',
          sentAt,
          rawJson: rawJson as Prisma.InputJsonValue,
        },
      }),
    writeAuditLog: (input) => writeAuditLog(input),
    now: () => new Date(),
  };
}

export function getSupportedConversationAttachment(file: {
  type: string;
  name: string;
}): SupportedConversationAttachment | null {
  const mimeType = file.type.trim().toLowerCase();
  const filename = file.name.trim();
  const normalizedFilename = filename.toLowerCase();

  if (mimeType === 'application/pdf' || normalizedFilename.endsWith('.pdf')) {
    return {
      kind: 'document',
      messageType: 'DOCUMENT',
      sendMediaType: 'document',
      mimeType: 'application/pdf',
      filename: filename || 'documento.pdf',
    };
  }

  if (
    mimeType === 'image/jpeg' ||
    normalizedFilename.endsWith('.jpg') ||
    normalizedFilename.endsWith('.jpeg')
  ) {
    return {
      kind: 'image',
      messageType: 'IMAGE',
      sendMediaType: 'image',
      mimeType: 'image/jpeg',
      filename: filename || 'imagen.jpg',
    };
  }

  if (mimeType === 'image/png' || normalizedFilename.endsWith('.png')) {
    return {
      kind: 'image',
      messageType: 'IMAGE',
      sendMediaType: 'image',
      mimeType: 'image/png',
      filename: filename || 'imagen.png',
    };
  }

  return null;
}

function defaultAttachmentDeps(): SendConversationDocumentMessageDeps {
  return {
    findConversation: (conversationId) =>
      prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
          id: true,
          contact: {
            select: {
              id: true,
              waId: true,
              lastInboundAt: true,
              lastWindowOpenedAt: true,
              lastWindowOpenedBy: true,
            },
          },
        },
      }),
    uploadMedia: ({ file, filename, mimeType }) =>
      createWhatsAppCloudClient().uploadMedia({ file, filename, mimeType }),
    sendMedia: ({ to, type, mediaId, filename, caption }) =>
      createWhatsAppCloudClient().sendMedia({
        to,
        type,
        mediaId,
        filename,
        caption,
      }),
    persistAttachmentMessage: async ({
      conversationId,
      contactId,
      wamid,
      messageType,
      body,
      caption,
      sentAt,
      rawJson,
      mediaId,
      mimeType,
      filename,
      size,
      bytes,
    }) => {
      const config = getConfig();
      const assetId = randomUUID();
      const storageKey = safeMediaStorageKey(assetId, filename);
      await writePrivateMedia(config.storage.mediaRoot, storageKey, bytes);

      await prisma.$transaction(async (tx) => {
        const message = await tx.message.create({
          data: {
            wamid,
            conversationId,
            contactId,
            direction: 'OUTBOUND',
            type: messageType,
            body,
            caption,
            status: 'SENT',
            sentAt,
            rawJson: rawJson as Prisma.InputJsonValue,
          },
        });

        await tx.mediaAsset.create({
          data: {
            id: assetId,
            messageId: message.id,
            waMediaId: mediaId,
            mimeType,
            filename,
            size,
            sha256: sha256Hex(bytes),
            storageKey,
            downloadStatus: 'READY',
          },
        });

        await tx.conversation.update({
          where: { id: conversationId },
          data: { lastMessageAt: sentAt },
        });
      });
    },
    writeAuditLog: (input) => writeAuditLog(input),
    now: () => new Date(),
  };
}

export async function sendConversationTextMessage(
  input: SendConversationTextMessageInput,
  deps: SendConversationTextMessageDeps = defaultDeps(),
): Promise<SendConversationTextMessageResult> {
  const requestedBody = input.body.trim();
  const retryMessage =
    input.retryMessageId && deps.findRetryMessage
      ? await deps.findRetryMessage({
          conversationId: input.conversationId,
          messageId: input.retryMessageId,
        })
      : null;
  const body = requestedBody || retryMessage?.body?.trim() || '';
  if (!body) {
    return {
      ok: false,
      blockedReason: 'empty_body',
      notice: 'Escribí un mensaje antes de enviarlo.',
    };
  }

  const conversation = await deps.findConversation(input.conversationId);
  if (!conversation) {
    return {
      ok: false,
      blockedReason: 'not_found',
      notice: 'La conversación ya no está disponible.',
    };
  }

  const composerState = getConversationComposerState(
    getWindowOpenedAt(conversation.contact),
    deps.now(),
  );
  if (!composerState.canSendFreeText) {
    return { ok: false, blockedReason: 'template_only', notice: composerState.notice };
  }

  const sentAt = deps.now();
  const retryRawJson =
    retryMessage?.rawJson && typeof retryMessage.rawJson === 'object'
      ? (retryMessage.rawJson as { quotedWamid?: string })
      : null;

  const quotedMessage = input.quotedMessageId
    ? await deps.findQuotedMessage({
        conversationId: conversation.id,
        messageId: input.quotedMessageId,
      })
    : null;

  let wamid: string | undefined;
  let rawJson: Record<string, unknown>;
  let sendFailed = false;

  try {
    const response = await deps.sendText({
      to: conversation.contact.waId,
      body,
      context: quotedMessage?.wamid
        ? { message_id: quotedMessage.wamid }
        : retryRawJson?.quotedWamid
          ? { message_id: retryRawJson.quotedWamid }
          : undefined,
    });
    wamid = response.messages?.[0]?.id;
    rawJson = quotedMessage
      ? {
          ...response,
          quotedMessageId: quotedMessage.id,
          quotedWamid: quotedMessage.wamid,
          quotedMessagePreview: {
            body: quotedMessage.body,
            caption: quotedMessage.caption,
            type: quotedMessage.type,
            direction: quotedMessage.direction,
          },
        }
      : response;
  } catch (error) {
    sendFailed = true;
    rawJson = {
      error: error instanceof Error ? error.message : 'WhatsApp send failed',
    };
  }

  await deps.updateConversation({ id: conversation.id, lastMessageAt: sentAt });
  const persisted =
    retryMessage && deps.updateMessage
      ? await deps.updateMessage({
          id: retryMessage.id,
          wamid: sendFailed ? undefined : wamid,
          body,
          sentAt,
          rawJson,
          status: sendFailed ? 'FAILED' : 'SENT',
        })
      : await deps.createMessage({
          wamid: sendFailed ? undefined : wamid,
          conversationId: conversation.id,
          contactId: conversation.contact.id,
          body,
          sentAt,
          rawJson,
          status: sendFailed ? 'FAILED' : undefined,
        });
  await deps.writeAuditLog({
    userId: input.session.userId,
    action: AUDIT_ACTIONS.INBOX_FREE_TEXT_SENT,
    entityType: 'conversation',
    entityId: conversation.id,
    metadata: { wamid: sendFailed ? undefined : wamid, bodyLength: body.length },
  });

  const message = toQuotedMessageState(persisted);

  if (sendFailed) {
    return {
      ok: false,
      blockedReason: 'send_failed',
      notice:
        'El mensaje no pudo enviarse a WhatsApp. Quedó registrado como pendiente de reintento.',
      message,
    };
  }

  return { ok: true, blockedReason: null, message };
}

export async function sendConversationTemplateMessage(
  input: SendConversationTemplateMessageInput,
  deps: SendConversationTemplateMessageDeps = defaultTemplateDeps(),
): Promise<SendConversationTemplateMessageResult> {
  const selectedTemplate = parseConversationTemplateKey(input.templateKey.trim());
  if (!selectedTemplate) {
    return {
      ok: false,
      blockedReason: 'missing_template',
      notice: 'Elegí una plantilla para reabrir la conversación.',
    };
  }

  const conversation = await deps.findConversation(input.conversationId);
  if (!conversation) {
    return {
      ok: false,
      blockedReason: 'not_found',
      notice: 'La conversación ya no está disponible.',
    };
  }

  const availableTemplates = await deps.listTemplates();
  const template = availableTemplates.find(
    (item) =>
      item.name === selectedTemplate.name && item.languageCode === selectedTemplate.languageCode,
  );
  if (!template) {
    return {
      ok: false,
      blockedReason: 'template_unavailable',
      notice: 'La plantilla elegida ya no está disponible para esta apertura.',
    };
  }

  const sentAt = deps.now();
  const nextWindowState = resolveWindowState(
    getWindowOpenedAt(conversation.contact),
    getWindowOpenedBy(conversation.contact),
    sentAt,
    'TEMPLATE',
  );
  const response = await deps.sendTemplate({
    to: conversation.contact.waId,
    templateName: template.name,
    languageCode: template.languageCode,
  });
  const wamid = response.messages?.[0]?.id;
  const body =
    renderTemplateBody(template.body) ||
    `Plantilla enviada: ${template.name} (${template.languageCode})`;

  await deps.updateConversation({ id: conversation.id, lastMessageAt: sentAt });
  await deps.updateContactWindow({
    contactId: conversation.contact.id,
    openedAt: nextWindowState.openedAt,
    openedBy: nextWindowState.openedBy,
  });
  await deps.createMessage({
    wamid,
    conversationId: conversation.id,
    contactId: conversation.contact.id,
    body,
    sentAt,
    rawJson: response,
  });
  await deps.writeAuditLog({
    userId: input.session.userId,
    action: AUDIT_ACTIONS.INBOX_TEMPLATE_SENT,
    entityType: 'conversation',
    entityId: conversation.id,
    metadata: { wamid, templateName: template.name, languageCode: template.languageCode },
  });

  return { ok: true, blockedReason: null };
}

export async function sendConversationDocumentMessage(
  input: SendConversationDocumentMessageInput,
  deps:
    | SendConversationDocumentMessageDeps
    | SendConversationDocumentCompatDeps = defaultAttachmentDeps(),
): Promise<SendConversationDocumentMessageResult> {
  const file = input.file;
  if (file && file.size > 0) {
    const mimeType = file.type.trim().toLowerCase();
    if (mimeType !== 'application/pdf' && !file.name.trim().toLowerCase().endsWith('.pdf')) {
      return {
        ok: false,
        blockedReason: 'unsupported_type',
        notice:
          'Por ahora podés adjuntar PDF, JPG o PNG desde el Inbox. WhatsApp Cloud API no acepta WEBP como imagen saliente.',
      };
    }
  }

  return sendConversationAttachmentMessage(input, {
    findConversation: deps.findConversation,
    uploadMedia: 'uploadMedia' in deps ? deps.uploadMedia : deps.uploadDocument,
    sendMedia:
      'sendMedia' in deps
        ? deps.sendMedia
        : ({ to, mediaId, filename, caption }) =>
            deps.sendDocument({ to, mediaId, filename, caption }),
    persistAttachmentMessage:
      'persistAttachmentMessage' in deps
        ? deps.persistAttachmentMessage
        : deps.persistDocumentMessage,
    writeAuditLog: deps.writeAuditLog,
    now: deps.now,
  });
}

export async function sendConversationAttachmentMessage(
  input: SendConversationDocumentMessageInput,
  deps: SendConversationDocumentMessageDeps = defaultAttachmentDeps(),
): Promise<SendConversationAttachmentMessageResult> {
  const file = input.file;
  if (!file || file.size <= 0) {
    return {
      ok: false,
      blockedReason: 'missing_file',
      notice: 'Elegí una imagen o un PDF antes de enviarlo.',
    };
  }

  const attachment = getSupportedConversationAttachment(file);
  if (!attachment) {
    return {
      ok: false,
      blockedReason: 'unsupported_type',
      notice:
        'Por ahora podés adjuntar PDF, JPG o PNG desde el Inbox. WhatsApp Cloud API no acepta WEBP como imagen saliente.',
    };
  }

  const conversation = await deps.findConversation(input.conversationId);
  if (!conversation) {
    return {
      ok: false,
      blockedReason: 'not_found',
      notice: 'La conversación ya no está disponible.',
    };
  }

  const composerState = getConversationComposerState(
    getWindowOpenedAt(conversation.contact),
    deps.now(),
  );
  if (!composerState.canSendFreeText) {
    return { ok: false, blockedReason: 'template_only', notice: composerState.notice };
  }

  const filename = attachment.filename;
  const mimeType = attachment.mimeType;
  const caption = input.caption.trim() || undefined;
  const sentAt = deps.now();
  const bytes = Buffer.from(await file.arrayBuffer());
  const upload = await deps.uploadMedia({ file, filename, mimeType });
  const response = await deps.sendMedia({
    to: conversation.contact.waId,
    type: attachment.sendMediaType,
    mediaId: upload.id,
    filename,
    caption,
  });
  const wamid = response.messages?.[0]?.id;

  const persistedMessage = await deps.persistAttachmentMessage({
    conversationId: conversation.id,
    contactId: conversation.contact.id,
    wamid,
    messageType: attachment.messageType,
    body: null,
    caption: caption ?? null,
    sentAt,
    rawJson: {
      ...response,
      mediaId: upload.id,
    },
    mediaId: upload.id,
    mimeType,
    filename,
    size: file.size,
    bytes,
  });
  await deps.writeAuditLog({
    userId: input.session.userId,
    action:
      attachment.kind === 'image'
        ? AUDIT_ACTIONS.INBOX_IMAGE_SENT
        : AUDIT_ACTIONS.INBOX_DOCUMENT_SENT,
    entityType: 'conversation',
    entityId: conversation.id,
    metadata: { wamid, mediaId: upload.id, filename, mimeType, size: file.size },
  });

  return persistedMessage
    ? { ok: true, blockedReason: null, message: persistedMessage }
    : { ok: true, blockedReason: null };
}

export async function sendConversationAttachmentMessages(
  input: SendConversationAttachmentMessagesInput,
  sendAttachment: (
    input: SendConversationDocumentMessageInput,
  ) => Promise<SendConversationAttachmentMessageResult> = (singleInput) =>
    sendConversationAttachmentMessage(singleInput),
): Promise<SendConversationAttachmentMessagesResult> {
  const files = input.files.filter((file) => file.size > 0);

  if (files.length === 0) {
    return {
      ok: false,
      blockedReason: 'missing_file',
      notice: 'Elegí una imagen o un PDF antes de enviarlo.',
    };
  }

  if (files.some((file) => !getSupportedConversationAttachment(file))) {
    return {
      ok: false,
      blockedReason: 'unsupported_type',
      notice:
        'Por ahora podés adjuntar PDF, JPG o PNG desde el Inbox. WhatsApp Cloud API no acepta WEBP como imagen saliente.',
    };
  }

  let firstMessage: QuotedMessageState | undefined;

  for (const [index, file] of files.entries()) {
    const result = await sendAttachment({
      conversationId: input.conversationId,
      session: input.session,
      file,
      caption: index === 0 ? input.caption : '',
    });

    if (!result.ok) {
      return {
        ok: false,
        blockedReason: result.blockedReason,
        notice: result.notice,
        message: result.message,
      };
    }

    if (index === 0 && result.message) {
      firstMessage = result.message;
    }
  }

  return { ok: true, blockedReason: null, sentCount: files.length, message: firstMessage };
}
