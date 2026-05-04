type LaunchRecipient = {
  id: string;
  contact: { waId: string; displayName?: string | null; phone?: string };
};

type LaunchCampaign = {
  id: string;
  status?: string;
  templateName: string;
  templateLanguage: string;
  recipients: LaunchRecipient[];
};

type CampaignLaunchPrisma = {
  campaign: {
    update: (input: {
      where: { id: string };
      data: { status: 'SENDING' | 'FAILED' };
    }) => Promise<unknown>;
    updateMany?: (input: {
      where: { id: string; status: 'DRAFT' | 'QUEUED' };
      data: { status: 'SENDING' };
    }) => Promise<{ count: number }>;
  };
  campaignRecipient: {
    update: (input: {
      where: { id: string };
      data: { status: 'FAILED'; lastError: string };
    }) => Promise<unknown>;
  };
};

type EnqueueCampaignSend = (
  campaignId: string,
  recipientId: string,
  contactWaId: string,
  templateName: string,
  templateLanguage: string,
  attempt: number,
  contactData?: { displayName?: string | null; phone?: string },
) => Promise<unknown>;

export async function launchCampaignImmediately(input: {
  campaign: LaunchCampaign;
  prisma: CampaignLaunchPrisma;
  enqueueCampaignSend: EnqueueCampaignSend;
}) {
  const { campaign, prisma, enqueueCampaignSend } = input;
  if (prisma.campaign.updateMany) {
    const claim = await prisma.campaign.updateMany({
      where: { id: campaign.id, status: 'DRAFT' },
      data: { status: 'SENDING' },
    });
    if (claim.count === 0) return { queued: 0, failed: 0, skipped: true as const };
  }

  return enqueueClaimedCampaign(campaign, prisma, enqueueCampaignSend);
}

export async function launchScheduledCampaign(input: {
  campaign: LaunchCampaign;
  prisma: CampaignLaunchPrisma;
  enqueueCampaignSend: EnqueueCampaignSend;
}) {
  const { campaign, prisma, enqueueCampaignSend } = input;
  if (prisma.campaign.updateMany) {
    const claim = await prisma.campaign.updateMany({
      where: { id: campaign.id, status: 'QUEUED' },
      data: { status: 'SENDING' },
    });
    if (claim.count === 0) return { queued: 0, failed: 0, skipped: true as const };
  }

  return enqueueClaimedCampaign(campaign, prisma, enqueueCampaignSend);
}

async function enqueueClaimedCampaign(
  campaign: LaunchCampaign,
  prisma: CampaignLaunchPrisma,
  enqueueCampaignSend: EnqueueCampaignSend,
) {
  await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'SENDING' } });

  let queued = 0;
  let failed = 0;
  for (const recipient of campaign.recipients) {
    try {
      await enqueueCampaignSend(
        campaign.id,
        recipient.id,
        recipient.contact.waId,
        campaign.templateName,
        campaign.templateLanguage,
        1,
        { displayName: recipient.contact.displayName, phone: recipient.contact.phone },
      );
      queued += 1;
    } catch {
      failed += 1;
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: 'FAILED', lastError: 'Queue unavailable' },
      });
    }
  }

  if (queued === 0) {
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'FAILED' } });
  }

  return { queued, failed };
}
