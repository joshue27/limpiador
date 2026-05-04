import { describe, expect, it, vi } from 'vitest';

import { createWorkerRuntime, processCampaignSend } from '@/worker/index';

describe('worker runtime lifecycle', () => {
  it('registers process handlers and closes BullMQ workers before queues, Redis, and Prisma', async () => {
    const events: string[] = [];
    const lifecycle = { attachProcessHandlers: vi.fn(), register: vi.fn() };
    const mediaWorker = { name: 'media-downloads', close: vi.fn(async (force?: boolean) => { events.push(`media:${String(force)}`); }) };
    const webhookWorker = { name: 'webhook-events', close: vi.fn(async (force?: boolean) => { events.push(`webhook:${String(force)}`); }) };

    const runtime = createWorkerRuntime({
      workers: [mediaWorker, webhookWorker],
      closeQueueProducers: async () => { events.push('queues.closed'); },
      disconnectRateLimitRedis: async () => { events.push('redis.closed'); },
      disconnectPrisma: async () => { events.push('prisma.closed'); },
      lifecycle,
      closeTimeoutMs: 250,
    });

    await runtime.close();

    expect(runtime.workers).toEqual(['media-downloads', 'webhook-events']);
    expect(lifecycle.attachProcessHandlers).toHaveBeenCalledOnce();
    expect(lifecycle.register).toHaveBeenCalledWith('worker-runtime', runtime.close);
    expect(mediaWorker.close).toHaveBeenCalledWith(false);
    expect(webhookWorker.close).toHaveBeenCalledWith(false);
    expect(events).toEqual(['media:false', 'webhook:false', 'queues.closed', 'redis.closed', 'prisma.closed']);
  });

  it('uses bounded BullMQ close semantics so a stuck worker fails shutdown predictably', async () => {
    const stuckWorker = { name: 'campaign-sends', close: vi.fn(() => new Promise<void>(() => undefined)) };
    const runtime = createWorkerRuntime({
      workers: [stuckWorker],
      closeQueueProducers: async () => undefined,
      disconnectRateLimitRedis: async () => undefined,
      disconnectPrisma: async () => undefined,
      lifecycle: { attachProcessHandlers: vi.fn(), register: vi.fn() },
      closeTimeoutMs: 1,
    });

    await expect(runtime.close()).rejects.toThrow('Worker shutdown exceeded 1ms');
    expect(stuckWorker.close).toHaveBeenCalledWith(false);
  });

  it('runs registered interval cleanup tasks before closing external resources', async () => {
    const events: string[] = [];
    const runtime = createWorkerRuntime({
      workers: [{ name: 'export-generation', close: vi.fn(async () => { events.push('worker.closed'); }) }],
      cleanupTasks: [() => { events.push('intervals.cleared'); }],
      closeQueueProducers: async () => { events.push('queues.closed'); },
      disconnectRateLimitRedis: async () => { events.push('redis.closed'); },
      disconnectPrisma: async () => { events.push('prisma.closed'); },
      lifecycle: { attachProcessHandlers: vi.fn(), register: vi.fn() },
      closeTimeoutMs: 250,
    });

    await runtime.close();

    expect(events).toEqual(['intervals.cleared', 'worker.closed', 'queues.closed', 'redis.closed', 'prisma.closed']);
  });
});

describe('campaign send finalization', () => {
  it('marks a campaign FAILED when the final retry fails and no recipient was sent', async () => {
    const prisma = createCampaignSendPrisma({ sentCount: 0, pendingCountAfterFailure: 0 });
    const client = {
      sendTemplate: vi.fn(async () => {
        throw new Error('provider down');
      }),
    };

    await expect(
      processCampaignSend(
        {
          campaignId: 'campaign-1',
          recipientId: 'recipient-1',
          contactWaId: '5021',
          templateName: 'hello_world',
          templateLanguage: 'es',
          attempt: 3,
          contactData: { displayName: 'Josue', phone: '5021' },
        },
        { prisma, client, delay: async () => undefined },
      ),
    ).rejects.toThrow('provider down');

    expect(prisma.campaignRecipient.update).toHaveBeenCalledWith({
      where: { id: 'recipient-1' },
      data: { status: 'FAILED', lastError: 'provider down', attemptCount: 3 },
    });
    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 'campaign-1' },
      data: { status: 'FAILED' },
    });
  });

  it('marks a campaign COMPLETED when the final retry fails after other recipients were sent', async () => {
    const prisma = createCampaignSendPrisma({ sentCount: 2, pendingCountAfterFailure: 0 });
    const client = {
      sendTemplate: vi.fn(async () => {
        throw new Error('bad template');
      }),
    };

    await expect(
      processCampaignSend(
        {
          campaignId: 'campaign-1',
          recipientId: 'recipient-3',
          contactWaId: '5023',
          templateName: 'hello_world',
          templateLanguage: 'es',
          attempt: 3,
          contactData: { displayName: 'Josue', phone: '5023' },
        },
        { prisma, client, delay: async () => undefined },
      ),
    ).rejects.toThrow('bad template');

    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 'campaign-1' },
      data: { status: 'COMPLETED' },
    });
  });
});

function createCampaignSendPrisma(input: { sentCount: number; pendingCountAfterFailure: number }) {
  return {
    campaignRecipient: {
      findUnique: vi.fn(async () => ({
        id: 'recipient-1',
        contactId: 'contact-1',
        status: 'PENDING',
        campaign: { status: 'SENDING', bodyPlaceholderMap: {} },
      })),
      update: vi.fn(async () => undefined),
      count: vi.fn(
        async ({ where }: { where: { status: 'PENDING' | { in: Array<'SENT' | 'DELIVERED' | 'READ'> } } }) =>
          where.status === 'PENDING' ? input.pendingCountAfterFailure : input.sentCount,
      ),
      findFirst: vi.fn(async () => ({ csvData: {} })),
    },
    campaign: {
      update: vi.fn(async () => undefined),
    },
    messageTemplate: {
      findUnique: vi.fn(async () => ({ body: 'Hola {{1}}, tu número es {{2}}' })),
    },
  };
}
