import { describe, expect, it, vi } from 'vitest';

import {
  sendConversationAttachmentMessage,
  sendConversationAttachmentMessages,
  sendConversationDocumentMessage,
  sendConversationTemplateMessage,
  sendConversationTextMessage,
} from '@/modules/inbox/composer';
import type { QuotedMessageState } from '@/modules/inbox/message-history';
import { messageResponse } from '@/modules/inbox/message-response';

function makePersistedRow(
  overrides: Partial<QuotedMessageState> & { id: string; createdAt: Date; rawJson: unknown },
): QuotedMessageState {
  return {
    direction: 'OUTBOUND',
    type: 'TEXT',
    body: 'Hola, seguimos por acá.',
    caption: null,
    status: 'SENT',
    mediaAssets: [],
    ...overrides,
  };
}

describe('sendConversationTextMessage', () => {
  const sentAt = new Date('2026-04-24T18:00:00.000Z');
  const sentAtIso = sentAt.toISOString();

  it('envía, persiste y audita cuando la ventana está activa', async () => {
    const persisted = makePersistedRow({
      id: 'msg-1',
      createdAt: sentAt,
      rawJson: { messages: [{ id: 'wamid-1' }] },
    });
    const sendText = vi.fn().mockResolvedValue({ messages: [{ id: 'wamid-1' }] });
    const updateConversation = vi.fn().mockResolvedValue(undefined);
    const createMessage = vi.fn().mockResolvedValue(persisted);
    const writeAuditLog = vi.fn().mockResolvedValue(undefined);

    const result = await sendConversationTextMessage(
      {
        conversationId: 'conv-1',
        session: { userId: 'user-1', email: 'op@example.com', name: null, role: 'OPERATOR' },
        body: 'Hola, seguimos por acá.',
      },
      {
        findConversation: vi.fn().mockResolvedValue({
          id: 'conv-1',
          contact: {
            id: 'contact-1',
            waId: '5491112345678',
            lastInboundAt: new Date('2026-04-24T10:00:00.000Z'),
          },
        }),
        findQuotedMessage: vi.fn(),
        sendText,
        updateConversation,
        createMessage,
        writeAuditLog,
        now: () => sentAt,
      },
    );

    expect(result).toEqual({
      ok: true,
      blockedReason: null,
      message: { ...persisted, createdAt: sentAtIso },
    });
    expect(sendText).toHaveBeenCalledWith({ to: '5491112345678', body: 'Hola, seguimos por acá.' });
    expect(updateConversation).toHaveBeenCalledWith({
      id: 'conv-1',
      lastMessageAt: sentAt,
    });
    expect(createMessage).toHaveBeenCalledWith({
      wamid: 'wamid-1',
      conversationId: 'conv-1',
      contactId: 'contact-1',
      body: 'Hola, seguimos por acá.',
      sentAt,
      rawJson: { messages: [{ id: 'wamid-1' }] },
    });
    expect(writeAuditLog).toHaveBeenCalledWith({
      userId: 'user-1',
      action: 'inbox.free_text_sent',
      entityType: 'conversation',
      entityId: 'conv-1',
      metadata: { wamid: 'wamid-1', bodyLength: 23 },
    });
  });

  it('devuelve el mensaje con estado SENT y los campos de identidad correctos', async () => {
    const persisted = makePersistedRow({
      id: 'msg-2',
      createdAt: sentAt,
      body: 'Test',
      rawJson: { messages: [{ id: 'wamid-2' }] },
    });
    const createMessage = vi.fn().mockResolvedValue(persisted);

    const result = await sendConversationTextMessage(
      {
        conversationId: 'conv-1',
        session: { userId: 'user-1', email: 'op@example.com', name: null, role: 'OPERATOR' },
        body: 'Test',
      },
      {
        findConversation: vi.fn().mockResolvedValue({
          id: 'conv-1',
          contact: {
            id: 'contact-1',
            waId: '5491112345678',
            lastInboundAt: new Date('2026-04-24T10:00:00.000Z'),
          },
        }),
        findQuotedMessage: vi.fn(),
        sendText: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid-2' }] }),
        updateConversation: vi.fn().mockResolvedValue(undefined),
        createMessage,
        writeAuditLog: vi.fn().mockResolvedValue(undefined),
        now: () => sentAt,
      },
    );

    expect(result.ok).toBe(true);
    expect(result).toHaveProperty('message');
    const msg = (result as { ok: true; message: QuotedMessageState }).message;
    expect(msg.id).toBe('msg-2');
    expect(msg.status).toBe('SENT');
    expect(msg.direction).toBe('OUTBOUND');
    expect(msg.type).toBe('TEXT');
    expect(msg.body).toBe('Test');
    expect(msg.createdAt).toEqual(sentAtIso);
  });

  it('rechaza el envío libre cuando la ventana está cerrada y deja preparado template_only', async () => {
    const sendText = vi.fn();
    const createMessage = vi.fn();
    const writeAuditLog = vi.fn();

    const result = await sendConversationTextMessage(
      {
        conversationId: 'conv-1',
        session: { userId: 'user-1', email: 'op@example.com', name: null, role: 'OPERATOR' },
        body: 'Hola, seguimos por acá.',
      },
      {
        findConversation: vi.fn().mockResolvedValue({
          id: 'conv-1',
          contact: {
            id: 'contact-1',
            waId: '5491112345678',
            lastInboundAt: new Date('2026-04-23T10:00:00.000Z'),
          },
        }),
        findQuotedMessage: vi.fn(),
        sendText,
        updateConversation: vi.fn(),
        createMessage,
        writeAuditLog,
        now: () => sentAt,
      },
    );

    expect(result).toEqual({
      ok: false,
      blockedReason: 'template_only',
      notice:
        'La ventana de 24 horas está cerrada. Prepará una plantilla para retomar la conversación.',
    });
    expect(sendText).not.toHaveBeenCalled();
    expect(createMessage).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it('persiste FAILED y devuelve mensaje con ok:false cuando WhatsApp falla operativamente', async () => {
    const sendError = new Error('WhatsApp Cloud API timeout');
    const failedRow = makePersistedRow({
      id: 'msg-failed-1',
      createdAt: sentAt,
      status: 'FAILED',
      body: 'Hola',
      rawJson: { error: 'WhatsApp Cloud API timeout' },
    });
    const sendText = vi.fn().mockRejectedValue(sendError);
    const createMessage = vi.fn().mockResolvedValue(failedRow);
    const writeAuditLog = vi.fn().mockResolvedValue(undefined);

    const result = await sendConversationTextMessage(
      {
        conversationId: 'conv-1',
        session: { userId: 'user-1', email: 'op@example.com', name: null, role: 'OPERATOR' },
        body: 'Hola',
      },
      {
        findConversation: vi.fn().mockResolvedValue({
          id: 'conv-1',
          contact: {
            id: 'contact-1',
            waId: '5491112345678',
            lastInboundAt: new Date('2026-04-24T10:00:00.000Z'),
          },
        }),
        findQuotedMessage: vi.fn(),
        sendText,
        updateConversation: vi.fn().mockResolvedValue(undefined),
        createMessage,
        writeAuditLog,
        now: () => sentAt,
      },
    );

    expect(result.ok).toBe(false);
    expect(result).toHaveProperty('blockedReason', 'send_failed');
    expect(result).toHaveProperty('notice');
    expect(result).toHaveProperty('message');
    const msg = (
      result as {
        ok: false;
        blockedReason: 'send_failed';
        notice: string;
        message?: QuotedMessageState;
      }
    ).message;
    expect(msg?.status).toBe('FAILED');
    expect(msg?.id).toBe('msg-failed-1');
    expect(msg?.direction).toBe('OUTBOUND');
    expect(createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        wamid: undefined,
        body: 'Hola',
        conversationId: 'conv-1',
      }),
    );
    // Audit still fires for the failed attempt so it's traceable
    expect(writeAuditLog).toHaveBeenCalled();
  });

  it('no persiste ni audita cuando body está vacío', async () => {
    const createMessage = vi.fn();
    const writeAuditLog = vi.fn();

    const result = await sendConversationTextMessage(
      {
        conversationId: 'conv-1',
        session: { userId: 'user-1', email: 'op@example.com', name: null, role: 'OPERATOR' },
        body: '   ',
      },
      {
        findConversation: vi.fn(),
        findQuotedMessage: vi.fn(),
        sendText: vi.fn(),
        updateConversation: vi.fn(),
        createMessage,
        writeAuditLog,
        now: () => sentAt,
      },
    );

    expect(result).toEqual({
      ok: false,
      blockedReason: 'empty_body',
      notice: 'Escribí un mensaje antes de enviarlo.',
    });
    expect(createMessage).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it('incluye datos de mensaje citado en rawJson cuando se responde a un mensaje', async () => {
    const quotedMessage = {
      id: 'quoted-1',
      wamid: 'wamid-quoted-1',
      direction: 'INBOUND' as const,
      type: 'TEXT',
      body: 'Mensaje original',
      caption: null,
    };
    const persisted = makePersistedRow({
      id: 'msg-quoted-1',
      createdAt: sentAt,
      body: 'Respuesta',
      rawJson: {
        messages: [{ id: 'wamid-3' }],
        quotedMessageId: 'quoted-1',
        quotedWamid: 'wamid-quoted-1',
        quotedMessagePreview: {
          body: 'Mensaje original',
          caption: null,
          type: 'TEXT',
          direction: 'INBOUND',
        },
      },
    });
    const createMessage = vi.fn().mockResolvedValue(persisted);

    const result = await sendConversationTextMessage(
      {
        conversationId: 'conv-1',
        session: { userId: 'user-1', email: 'op@example.com', name: null, role: 'OPERATOR' },
        body: 'Respuesta',
        quotedMessageId: 'quoted-1',
      },
      {
        findConversation: vi.fn().mockResolvedValue({
          id: 'conv-1',
          contact: {
            id: 'contact-1',
            waId: '5491112345678',
            lastInboundAt: new Date('2026-04-24T10:00:00.000Z'),
          },
        }),
        findQuotedMessage: vi.fn().mockResolvedValue(quotedMessage),
        sendText: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid-3' }] }),
        updateConversation: vi.fn().mockResolvedValue(undefined),
        createMessage,
        writeAuditLog: vi.fn().mockResolvedValue(undefined),
        now: () => sentAt,
      },
    );

    expect(result.ok).toBe(true);
    expect(result).toHaveProperty('message');
    const msg = (result as { ok: true; message: QuotedMessageState }).message;
    expect(msg.id).toBe('msg-quoted-1');
    expect(msg.status).toBe('SENT');
    expect(createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        rawJson: expect.objectContaining({
          quotedMessageId: 'quoted-1',
          quotedWamid: 'wamid-quoted-1',
          quotedMessagePreview: expect.objectContaining({ body: 'Mensaje original' }),
        }),
      }),
    );
  });
});

describe('sendConversationTemplateMessage', () => {
  it('envía, persiste y audita una plantilla disponible cuando la ventana está cerrada', async () => {
    const sendTemplate = vi.fn().mockResolvedValue({ messages: [{ id: 'wamid-template-1' }] });
    const updateConversation = vi.fn().mockResolvedValue(undefined);
    const updateContactWindow = vi.fn().mockResolvedValue(undefined);
    const createMessage = vi.fn().mockResolvedValue(undefined);
    const writeAuditLog = vi.fn().mockResolvedValue(undefined);

    const result = await sendConversationTemplateMessage(
      {
        conversationId: 'conv-1',
        session: { userId: 'user-1', email: 'op@example.com', name: null, role: 'OPERATOR' },
        templateKey: 'reabrir_chat::es',
      },
      {
        findConversation: vi.fn().mockResolvedValue({
          id: 'conv-1',
          contact: {
            id: 'contact-1',
            waId: '5491112345678',
            lastInboundAt: new Date('2026-04-23T10:00:00.000Z'),
          },
        }),
        listTemplates: vi.fn().mockResolvedValue([
          {
            name: 'reabrir_chat',
            languageCode: 'es',
            body: 'Hola, retomamos la conversación.',
            footer: 'Atención al estudiante',
            buttons: [
              { type: 'QUICK_REPLY', text: 'Entendido' },
              { type: 'URL', text: 'Pagar ahora', url: 'https://example.test/pago' },
            ],
          },
        ]),
        sendTemplate,
        updateConversation,
        updateContactWindow,
        createMessage,
        writeAuditLog,
        now: () => new Date('2026-04-24T18:00:00.000Z'),
      },
    );

    expect(result).toEqual({ ok: true, blockedReason: null });
    expect(sendTemplate).toHaveBeenCalledWith({
      to: '5491112345678',
      templateName: 'reabrir_chat',
      languageCode: 'es',
    });
    expect(updateConversation).toHaveBeenCalledWith({
      id: 'conv-1',
      lastMessageAt: new Date('2026-04-24T18:00:00.000Z'),
    });
    expect(updateContactWindow).toHaveBeenCalledWith({
      contactId: 'contact-1',
      openedAt: new Date('2026-04-24T18:00:00.000Z'),
      openedBy: 'TEMPLATE',
    });
    expect(createMessage).toHaveBeenCalledWith({
      wamid: 'wamid-template-1',
      conversationId: 'conv-1',
      contactId: 'contact-1',
      body: 'Hola, retomamos la conversación.',
      sentAt: new Date('2026-04-24T18:00:00.000Z'),
      rawJson: {
        messages: [{ id: 'wamid-template-1' }],
        templateName: 'reabrir_chat',
        templateLanguage: 'es',
        templateFooter: 'Atención al estudiante',
        templateButtons: [
          { type: 'QUICK_REPLY', text: 'Entendido' },
          { type: 'URL', text: 'Pagar ahora', url: 'https://example.test/pago' },
        ],
      },
    });
    expect(writeAuditLog).toHaveBeenCalledWith({
      userId: 'user-1',
      action: 'inbox.template_sent',
      entityType: 'conversation',
      entityId: 'conv-1',
      metadata: { wamid: 'wamid-template-1', templateName: 'reabrir_chat', languageCode: 'es' },
    });
  });

  it('rechaza la plantilla cuando la opción elegida no está disponible', async () => {
    const sendTemplate = vi.fn();
    const createMessage = vi.fn();
    const updateContactWindow = vi.fn();
    const writeAuditLog = vi.fn();

    const result = await sendConversationTemplateMessage(
      {
        conversationId: 'conv-1',
        session: { userId: 'user-1', email: 'op@example.com', name: null, role: 'OPERATOR' },
        templateKey: 'reabrir_chat::es',
      },
      {
        findConversation: vi.fn().mockResolvedValue({
          id: 'conv-1',
          contact: { id: 'contact-1', waId: '5491112345678', lastInboundAt: null },
        }),
        listTemplates: vi
          .fn()
          .mockResolvedValue([{ name: 'seguimiento_pago', languageCode: 'es', buttons: [] }]),
        sendTemplate,
        updateConversation: vi.fn(),
        updateContactWindow,
        createMessage,
        writeAuditLog,
        now: () => new Date('2026-04-24T18:00:00.000Z'),
      },
    );

    expect(result).toEqual({
      ok: false,
      blockedReason: 'template_unavailable',
      notice: 'La plantilla elegida ya no está disponible para esta apertura.',
    });
    expect(sendTemplate).not.toHaveBeenCalled();
    expect(updateContactWindow).not.toHaveBeenCalled();
    expect(createMessage).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});

describe('sendConversationDocumentMessage', () => {
  it('sube, envía, persiste y audita un PDF cuando la ventana está activa', async () => {
    const uploadDocument = vi.fn().mockResolvedValue({ id: 'wa-media-1' });
    const sendDocument = vi.fn().mockResolvedValue({ messages: [{ id: 'wamid-document-1' }] });
    const persistDocumentMessage = vi.fn().mockResolvedValue(undefined);
    const writeAuditLog = vi.fn().mockResolvedValue(undefined);
    const file = new File(['pdf-data'], 'factura.pdf', { type: 'application/pdf' });

    const result = await sendConversationDocumentMessage(
      {
        conversationId: 'conv-1',
        session: { userId: 'user-1', email: 'op@example.com', name: null, role: 'OPERATOR' },
        file,
        caption: 'Factura abril',
      },
      {
        findConversation: vi.fn().mockResolvedValue({
          id: 'conv-1',
          contact: {
            id: 'contact-1',
            waId: '5491112345678',
            lastInboundAt: new Date('2026-04-24T10:00:00.000Z'),
          },
        }),
        uploadDocument,
        sendDocument,
        persistDocumentMessage,
        writeAuditLog,
        now: () => new Date('2026-04-24T18:00:00.000Z'),
      },
    );

    expect(result).toEqual({ ok: true, blockedReason: null });
    expect(uploadDocument).toHaveBeenCalledWith({
      file,
      filename: 'factura.pdf',
      mimeType: 'application/pdf',
    });
    expect(sendDocument).toHaveBeenCalledWith({
      to: '5491112345678',
      mediaId: 'wa-media-1',
      filename: 'factura.pdf',
      caption: 'Factura abril',
    });
    expect(persistDocumentMessage).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      contactId: 'contact-1',
      wamid: 'wamid-document-1',
      messageType: 'DOCUMENT',
      body: null,
      caption: 'Factura abril',
      sentAt: new Date('2026-04-24T18:00:00.000Z'),
      rawJson: { messages: [{ id: 'wamid-document-1' }], mediaId: 'wa-media-1' },
      mediaId: 'wa-media-1',
      mimeType: 'application/pdf',
      filename: 'factura.pdf',
      size: 8,
      bytes: expect.any(Buffer),
    });
    expect(writeAuditLog).toHaveBeenCalledWith({
      userId: 'user-1',
      action: 'inbox.document_sent',
      entityType: 'conversation',
      entityId: 'conv-1',
      metadata: {
        wamid: 'wamid-document-1',
        mediaId: 'wa-media-1',
        filename: 'factura.pdf',
        mimeType: 'application/pdf',
        size: 8,
      },
    });
  });

  it('rechaza adjuntos no PDF sin tocar WhatsApp ni persistencia', async () => {
    const uploadDocument = vi.fn();
    const sendDocument = vi.fn();
    const persistDocumentMessage = vi.fn();
    const writeAuditLog = vi.fn();
    const file = new File(['word-data'], 'nota.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    const result = await sendConversationDocumentMessage(
      {
        conversationId: 'conv-1',
        session: { userId: 'user-1', email: 'op@example.com', name: null, role: 'OPERATOR' },
        file,
        caption: '',
      },
      {
        findConversation: vi.fn(),
        uploadDocument,
        sendDocument,
        persistDocumentMessage,
        writeAuditLog,
        now: () => new Date('2026-04-24T18:00:00.000Z'),
      },
    );

    expect(result).toEqual({
      ok: false,
      blockedReason: 'unsupported_type',
      notice:
        'Por ahora podés adjuntar PDF, JPG o PNG desde el Inbox. WhatsApp Cloud API no acepta WEBP como imagen saliente.',
    });
    expect(uploadDocument).not.toHaveBeenCalled();
    expect(sendDocument).not.toHaveBeenCalled();
    expect(persistDocumentMessage).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it('bloquea el envío de PDF cuando la ventana ya está cerrada', async () => {
    const uploadDocument = vi.fn();
    const sendDocument = vi.fn();
    const persistDocumentMessage = vi.fn();
    const writeAuditLog = vi.fn();
    const file = new File(['pdf-data'], 'factura.pdf', { type: 'application/pdf' });

    const result = await sendConversationDocumentMessage(
      {
        conversationId: 'conv-1',
        session: { userId: 'user-1', email: 'op@example.com', name: null, role: 'OPERATOR' },
        file,
        caption: '',
      },
      {
        findConversation: vi.fn().mockResolvedValue({
          id: 'conv-1',
          contact: {
            id: 'contact-1',
            waId: '5491112345678',
            lastInboundAt: new Date('2026-04-23T10:00:00.000Z'),
          },
        }),
        uploadDocument,
        sendDocument,
        persistDocumentMessage,
        writeAuditLog,
        now: () => new Date('2026-04-24T18:00:00.000Z'),
      },
    );

    expect(result).toEqual({
      ok: false,
      blockedReason: 'template_only',
      notice:
        'La ventana de 24 horas está cerrada. Prepará una plantilla para retomar la conversación.',
    });
    expect(uploadDocument).not.toHaveBeenCalled();
    expect(sendDocument).not.toHaveBeenCalled();
    expect(persistDocumentMessage).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});

describe('sendConversationAttachmentMessage', () => {
  it('sube, envía, persiste y audita una imagen PNG cuando la ventana está activa', async () => {
    const uploadMedia = vi.fn().mockResolvedValue({ id: 'wa-media-image-1' });
    const sendMedia = vi.fn().mockResolvedValue({ messages: [{ id: 'wamid-image-1' }] });
    const persistAttachmentMessage = vi.fn().mockResolvedValue(undefined);
    const writeAuditLog = vi.fn().mockResolvedValue(undefined);
    const file = new File(['png-data'], 'foto.png', { type: 'image/png' });

    const result = await sendConversationAttachmentMessage(
      {
        conversationId: 'conv-1',
        session: { userId: 'user-1', email: 'op@example.com', name: null, role: 'OPERATOR' },
        file,
        caption: 'Vista previa del equipo',
      },
      {
        findConversation: vi.fn().mockResolvedValue({
          id: 'conv-1',
          contact: {
            id: 'contact-1',
            waId: '5491112345678',
            lastInboundAt: new Date('2026-04-24T10:00:00.000Z'),
          },
        }),
        uploadMedia,
        sendMedia,
        persistAttachmentMessage,
        writeAuditLog,
        now: () => new Date('2026-04-24T18:00:00.000Z'),
      },
    );

    expect(result).toEqual({ ok: true, blockedReason: null });
    expect(uploadMedia).toHaveBeenCalledWith({ file, filename: 'foto.png', mimeType: 'image/png' });
    expect(sendMedia).toHaveBeenCalledWith({
      to: '5491112345678',
      type: 'image',
      mediaId: 'wa-media-image-1',
      filename: 'foto.png',
      caption: 'Vista previa del equipo',
    });
    expect(persistAttachmentMessage).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      contactId: 'contact-1',
      wamid: 'wamid-image-1',
      messageType: 'IMAGE',
      body: null,
      caption: 'Vista previa del equipo',
      sentAt: new Date('2026-04-24T18:00:00.000Z'),
      rawJson: { messages: [{ id: 'wamid-image-1' }], mediaId: 'wa-media-image-1' },
      mediaId: 'wa-media-image-1',
      mimeType: 'image/png',
      filename: 'foto.png',
      size: 8,
      bytes: expect.any(Buffer),
    });
    expect(writeAuditLog).toHaveBeenCalledWith({
      userId: 'user-1',
      action: 'inbox.image_sent',
      entityType: 'conversation',
      entityId: 'conv-1',
      metadata: {
        wamid: 'wamid-image-1',
        mediaId: 'wa-media-image-1',
        filename: 'foto.png',
        mimeType: 'image/png',
        size: 8,
      },
    });
  });

  it('rechaza imágenes WEBP porque WhatsApp Cloud API no las acepta como imagen saliente', async () => {
    const uploadMedia = vi.fn();
    const sendMedia = vi.fn();
    const persistAttachmentMessage = vi.fn();
    const writeAuditLog = vi.fn();
    const file = new File(['webp-data'], 'pieza.webp', { type: '' });

    const result = await sendConversationAttachmentMessage(
      {
        conversationId: 'conv-1',
        session: { userId: 'user-1', email: 'op@example.com', name: null, role: 'OPERATOR' },
        file,
        caption: '',
      },
      {
        findConversation: vi.fn().mockResolvedValue({
          id: 'conv-1',
          contact: {
            id: 'contact-1',
            waId: '5491112345678',
            lastInboundAt: new Date('2026-04-24T10:00:00.000Z'),
          },
        }),
        uploadMedia,
        sendMedia,
        persistAttachmentMessage,
        writeAuditLog,
        now: () => new Date('2026-04-24T18:00:00.000Z'),
      },
    );

    expect(result).toEqual({
      ok: false,
      blockedReason: 'unsupported_type',
      notice:
        'Por ahora podés adjuntar PDF, JPG o PNG desde el Inbox. WhatsApp Cloud API no acepta WEBP como imagen saliente.',
    });
    expect(uploadMedia).not.toHaveBeenCalled();
    expect(sendMedia).not.toHaveBeenCalled();
  });

  it('rechaza tipos no soportados y documenta el set mínimo de imágenes admitidas', async () => {
    const uploadMedia = vi.fn();
    const sendMedia = vi.fn();
    const persistAttachmentMessage = vi.fn();
    const writeAuditLog = vi.fn();
    const file = new File(['gif-data'], 'animacion.gif', { type: 'image/gif' });

    const result = await sendConversationAttachmentMessage(
      {
        conversationId: 'conv-1',
        session: { userId: 'user-1', email: 'op@example.com', name: null, role: 'OPERATOR' },
        file,
        caption: '',
      },
      {
        findConversation: vi.fn(),
        uploadMedia,
        sendMedia,
        persistAttachmentMessage,
        writeAuditLog,
        now: () => new Date('2026-04-24T18:00:00.000Z'),
      },
    );

    expect(result).toEqual({
      ok: false,
      blockedReason: 'unsupported_type',
      notice:
        'Por ahora podés adjuntar PDF, JPG o PNG desde el Inbox. WhatsApp Cloud API no acepta WEBP como imagen saliente.',
    });
    expect(uploadMedia).not.toHaveBeenCalled();
    expect(sendMedia).not.toHaveBeenCalled();
    expect(persistAttachmentMessage).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});

describe('sendConversationAttachmentMessages', () => {
  it('envía múltiples adjuntos soportados y usa el texto solo como caption del primero', async () => {
    const sendSingleAttachment = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, blockedReason: null })
      .mockResolvedValueOnce({ ok: true, blockedReason: null });
    const pdf = new File(['pdf-data'], 'factura.pdf', { type: 'application/pdf' });
    const image = new File(['png-data'], 'foto.png', { type: 'image/png' });

    const result = await sendConversationAttachmentMessages(
      {
        conversationId: 'conv-1',
        session: { userId: 'user-1', email: 'op@example.com', name: null, role: 'OPERATOR' },
        files: [pdf, image],
        caption: 'Documentación de respaldo',
      },
      sendSingleAttachment,
    );

    expect(result).toEqual({ ok: true, blockedReason: null, sentCount: 2 });
    expect(sendSingleAttachment).toHaveBeenNthCalledWith(1, {
      conversationId: 'conv-1',
      session: { userId: 'user-1', email: 'op@example.com', name: null, role: 'OPERATOR' },
      file: pdf,
      caption: 'Documentación de respaldo',
    });
    expect(sendSingleAttachment).toHaveBeenNthCalledWith(2, {
      conversationId: 'conv-1',
      session: { userId: 'user-1', email: 'op@example.com', name: null, role: 'OPERATOR' },
      file: image,
      caption: '',
    });
  });

  it('rechaza el lote completo si aparece un archivo fuera de la whitelist', async () => {
    const sendSingleAttachment = vi.fn();
    const pdf = new File(['pdf-data'], 'factura.pdf', { type: 'application/pdf' });
    const gif = new File(['gif-data'], 'animacion.gif', { type: 'image/gif' });

    const result = await sendConversationAttachmentMessages(
      {
        conversationId: 'conv-1',
        session: { userId: 'user-1', email: 'op@example.com', name: null, role: 'OPERATOR' },
        files: [pdf, gif],
        caption: '',
      },
      sendSingleAttachment,
    );

    expect(result).toEqual({
      ok: false,
      blockedReason: 'unsupported_type',
      notice:
        'Por ahora podés adjuntar PDF, JPG o PNG desde el Inbox. WhatsApp Cloud API no acepta WEBP como imagen saliente.',
    });
    expect(sendSingleAttachment).not.toHaveBeenCalled();
  });
});

describe('messageResponse (route JSON contract)', () => {
  const sampleMessage: QuotedMessageState = {
    id: 'msg-1',
    direction: 'OUTBOUND',
    type: 'TEXT',
    body: 'Hola',
    caption: null,
    status: 'SENT',
    createdAt: '2026-04-24T18:00:00.000Z',
    mediaAssets: [],
    rawJson: { messages: [{ id: 'wamid-1' }] },
  };

  function jsonRequest(): Request {
    return new Request('http://localhost/inbox/conv-1/messages', {
      headers: { accept: 'application/json' },
    });
  }

  function htmlRequest(): Request {
    return new Request('http://localhost/inbox/conv-1/messages', {
      headers: { accept: 'text/html' },
    });
  }

  it('incluye message en JSON success cuando se provee', async () => {
    const response = messageResponse(
      jsonRequest(),
      'conv-1',
      'Mensaje enviado.',
      'success',
      200,
      sampleMessage,
    );
    const body = await response.json();

    expect(body).toEqual({
      ok: true,
      notice: 'Mensaje enviado.',
      type: 'success',
      message: sampleMessage,
    });
    expect(response.status).toBe(200);
  });

  it('incluye message en JSON error cuando se provee (send_failed)', async () => {
    const failedMessage: QuotedMessageState = {
      ...sampleMessage,
      id: 'msg-failed-1',
      status: 'FAILED',
    };
    const response = messageResponse(
      jsonRequest(),
      'conv-1',
      'El mensaje no pudo enviarse.',
      'error',
      400,
      failedMessage,
    );
    const body = await response.json();

    expect(body).toEqual({
      ok: false,
      notice: 'El mensaje no pudo enviarse.',
      type: 'error',
      message: failedMessage,
    });
    expect(response.status).toBe(400);
  });

  it('NO incluye message en JSON cuando no se provee (template o attachment)', async () => {
    const response = messageResponse(jsonRequest(), 'conv-1', 'Imagen enviada.', 'success');
    const body = await response.json();

    expect(body).toEqual({
      ok: true,
      notice: 'Imagen enviada.',
      type: 'success',
    });
    expect(body).not.toHaveProperty('message');
  });

  it('redirige sin incluir message en el body (HTML request)', async () => {
    const response = messageResponse(
      htmlRequest(),
      'conv-1',
      'Mensaje enviado.',
      'success',
      200,
      sampleMessage,
    );
    // HTML requests get a redirect, not JSON
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toContain('/inbox?conversation=conv-1');
  });
});
