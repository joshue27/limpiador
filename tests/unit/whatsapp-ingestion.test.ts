import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    contact: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    conversation: {
      upsert: vi.fn(),
    },
    message: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    mediaAsset: {
      upsert: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    messageStatusEvent: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    campaignRecipient: {
      updateMany: vi.fn(),
    },
  },
  routeInboundTextMessage: vi.fn(async () => undefined),
  enqueueMediaDownload: vi.fn(async () => undefined),
  enqueueWebhookEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/modules/inbox/routing', () => ({ routeInboundTextMessage: mocks.routeInboundTextMessage }));
vi.mock('@/modules/queue/queues', () => ({
  enqueueMediaDownload: mocks.enqueueMediaDownload,
  enqueueWebhookEvent: mocks.enqueueWebhookEvent,
}));

describe('ingestWhatsAppWebhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.contact.findUnique.mockResolvedValue(null);
    mocks.prisma.contact.upsert.mockResolvedValue({ id: 'contact-1', waId: '50255550000', assignedOperatorId: null });
    mocks.prisma.conversation.upsert.mockResolvedValue({ id: 'conversation-1' });
    mocks.prisma.message.upsert.mockResolvedValue({
      id: 'message-1',
      type: 'TEXT',
      direction: 'INBOUND',
      body: 'Hola',
    });
  });

  it('does not mutate conversation unread state for duplicate inbound webhook deliveries', async () => {
    mocks.prisma.message.findUnique.mockResolvedValue({ id: 'existing-message-1' });
    const { ingestWhatsAppWebhook } = await import('@/modules/whatsapp/ingestion');

    const result = await ingestWhatsAppWebhook(createInboundPayload());

    expect(result).toEqual({ messagesProcessed: 0, statusesProcessed: 0, mediaQueued: 0 });
    expect(mocks.prisma.contact.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.conversation.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.message.upsert).not.toHaveBeenCalled();
    expect(mocks.enqueueWebhookEvent).not.toHaveBeenCalled();
  });

  it('creates new inbound messages and updates unread state once', async () => {
    mocks.prisma.message.findUnique.mockResolvedValue(null);
    const { ingestWhatsAppWebhook } = await import('@/modules/whatsapp/ingestion');

    const result = await ingestWhatsAppWebhook(createInboundPayload());

    expect(result).toEqual({ messagesProcessed: 1, statusesProcessed: 0, mediaQueued: 0 });
    expect(mocks.prisma.contact.upsert).toHaveBeenCalledOnce();
    expect(mocks.prisma.conversation.upsert).toHaveBeenCalledOnce();
    expect(mocks.prisma.message.upsert).toHaveBeenCalledOnce();
    expect(mocks.enqueueWebhookEvent).toHaveBeenCalledWith('inbound-message', 'message-1');
  });
});

function createInboundPayload() {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ wa_id: '50255550000', profile: { name: 'Ada' } }],
              messages: [
                {
                  id: 'wamid-1',
                  from: '50255550000',
                  timestamp: '1714564800',
                  type: 'text',
                  text: { body: 'Hola' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}
