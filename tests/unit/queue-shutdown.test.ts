import { describe, expect, it, vi } from 'vitest';

import { closeQueueProducers, getCampaignQueue, getMediaQueue, getWebhookQueue } from '@/modules/queue/queues';

const createdQueues: Array<{ name: string; close: ReturnType<typeof vi.fn> }> = [];

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation((name: string) => {
    const queue = { name, close: vi.fn(async () => undefined) };
    createdQueues.push(queue);
    return queue;
  }),
}));

vi.mock('@/lib/config', () => ({
  getConfig: () => ({ redisUrl: 'redis://localhost:6379' }),
}));

describe('queue producer shutdown', () => {
  it('tracks created BullMQ queue producers and closes each producer once', async () => {
    const mediaQueue = getMediaQueue();
    getMediaQueue();
    const webhookQueue = getWebhookQueue();
    const campaignQueue = getCampaignQueue();

    await closeQueueProducers();

    expect(createdQueues.map((queue) => queue.name)).toEqual(['media-downloads', 'webhook-events', 'campaign-sends']);
    expect(mediaQueue).toBe(createdQueues[0]);
    expect(webhookQueue).toBe(createdQueues[1]);
    expect(campaignQueue).toBe(createdQueues[2]);
    expect(createdQueues.map((queue) => queue.close.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it('clears tracked producers after shutdown so replacement queues are new instances', async () => {
    const firstQueue = getMediaQueue();
    await closeQueueProducers();

    const secondQueue = getMediaQueue();

    expect(secondQueue).not.toBe(firstQueue);
    expect(createdQueues.at(-1)?.name).toBe('media-downloads');
  });
});
