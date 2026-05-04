import { describe, expect, it, vi } from 'vitest';

import { launchCampaignImmediately, launchScheduledCampaign } from '@/modules/campaigns/launch';

describe('campaign immediate launch', () => {
  it('moves the campaign to SENDING before enqueueing recipients so workers do not skip jobs', async () => {
    const events: string[] = [];
    const prisma = {
      campaign: {
        update: vi.fn(async () => {
          events.push('campaign:SENDING');
        }),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      campaignRecipient: {
        update: vi.fn(async () => {
          events.push('recipient:FAILED');
        }),
      },
    };
    const enqueueCampaignSend = vi.fn(async () => {
      events.push('enqueue');
    });

    const result = await launchCampaignImmediately({
      campaign: campaignWithRecipients(['recipient-1', 'recipient-2']),
      prisma,
      enqueueCampaignSend,
    });

    expect(result).toEqual({ queued: 2, failed: 0 });
    expect(prisma.campaign.updateMany).toHaveBeenCalledWith({
      where: { id: 'campaign-1', status: 'DRAFT' },
      data: { status: 'SENDING' },
    });
    expect(events).toEqual(['campaign:SENDING', 'enqueue', 'enqueue']);
  });

  it('marks the campaign FAILED when no recipient can be enqueued', async () => {
    const statusUpdates: string[] = [];
    const prisma = {
      campaign: {
        update: vi.fn(async ({ data }: { data: { status: string } }) => {
          statusUpdates.push(data.status);
        }),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      campaignRecipient: {
        update: vi.fn(async () => undefined),
      },
    };
    const enqueueCampaignSend = vi.fn(async () => {
      throw new Error('queue down');
    });

    const result = await launchCampaignImmediately({
      campaign: campaignWithRecipients(['recipient-1']),
      prisma,
      enqueueCampaignSend,
    });

    expect(result).toEqual({ queued: 0, failed: 1 });
    expect(statusUpdates).toEqual(['SENDING', 'FAILED']);
  });

  it('does not enqueue when the immediate launch status claim loses a race', async () => {
    const prisma = {
      campaign: {
        update: vi.fn(async () => undefined),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      campaignRecipient: {
        update: vi.fn(async () => undefined),
      },
    };
    const enqueueCampaignSend = vi.fn(async () => undefined);

    const result = await launchCampaignImmediately({
      campaign: campaignWithRecipients(['recipient-1']),
      prisma,
      enqueueCampaignSend,
    });

    expect(result).toEqual({ queued: 0, failed: 0, skipped: true });
    expect(enqueueCampaignSend).not.toHaveBeenCalled();
    expect(prisma.campaign.update).not.toHaveBeenCalled();
  });

  it('marks scheduled campaigns FAILED when every recipient enqueue fails', async () => {
    const statusUpdates: string[] = [];
    const prisma = {
      campaign: {
        update: vi.fn(async ({ data }: { data: { status: string } }) => {
          statusUpdates.push(data.status);
        }),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      campaignRecipient: {
        update: vi.fn(async () => undefined),
      },
    };
    const enqueueCampaignSend = vi.fn(async () => {
      throw new Error('queue down');
    });

    const result = await launchScheduledCampaign({
      campaign: campaignWithRecipients(['recipient-1', 'recipient-2']),
      prisma,
      enqueueCampaignSend,
    });

    expect(result).toEqual({ queued: 0, failed: 2 });
    expect(statusUpdates).toEqual(['SENDING', 'FAILED']);
    expect(prisma.campaign.updateMany).toHaveBeenCalledWith({
      where: { id: 'campaign-1', status: 'QUEUED' },
      data: { status: 'SENDING' },
    });
  });

  it('does not enqueue when the scheduled launch status claim loses a race', async () => {
    const prisma = {
      campaign: {
        update: vi.fn(async () => undefined),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      campaignRecipient: {
        update: vi.fn(async () => undefined),
      },
    };
    const enqueueCampaignSend = vi.fn(async () => undefined);

    const result = await launchScheduledCampaign({
      campaign: campaignWithRecipients(['recipient-1']),
      prisma,
      enqueueCampaignSend,
    });

    expect(result).toEqual({ queued: 0, failed: 0, skipped: true });
    expect(enqueueCampaignSend).not.toHaveBeenCalled();
    expect(prisma.campaign.update).not.toHaveBeenCalled();
  });
});

function campaignWithRecipients(ids: string[]) {
  return {
    id: 'campaign-1',
    templateName: 'hello_world',
    templateLanguage: 'es',
    recipients: ids.map((id) => ({
      id,
      contact: { waId: `502${id.at(-1)}`, displayName: `Contact ${id}`, phone: `502${id.at(-1)}` },
    })),
  };
}
