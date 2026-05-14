import { NextResponse } from 'next/server';
import { safeRedirect } from '@/lib/safe-redirect';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import { requirePermission } from '@/modules/auth/guards';
import { launchCampaignImmediately } from '@/modules/campaigns/launch';
import { enqueueCampaignSend } from '@/modules/queue/queues';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission('campaigns');

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: { recipients: { where: { status: 'PENDING' }, include: { contact: { select: { waId: true, displayName: true, phone: true } } } } },
  });

  if (!campaign) {
    return NextResponse.json({ error: 'Campaña no encontrada.' }, { status: 404 });
  }

  if (campaign.status !== 'DRAFT') {
    return NextResponse.json({ error: 'Solo se pueden lanzar campañas en borrador.' }, { status: 400 });
  }

  if (campaign.recipients.length === 0) {
    return NextResponse.json({ error: 'La campaña no tiene destinatarios pendientes.' }, { status: 400 });
  }

  const contentType = request.headers.get('content-type') ?? '';
  const formData = contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart')
    ? await request.formData()
    : null;
  const scheduledAt = formData?.get('scheduledAt')?.toString()?.trim();

  if (scheduledAt) {
    // Scheduled launch
    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
      return NextResponse.redirect(safeRedirect(request, '/campaigns'), { status: 303 });
    }
    await prisma.campaign.update({ where: { id }, data: { status: 'QUEUED', scheduledAt: scheduledDate } });

    await writeAuditLog({
      userId: session.userId,
      action: AUDIT_ACTIONS.CAMPAIGN_DRAFT_CREATED,
      entityType: 'campaign',
      entityId: id,
      metadata: { action: 'scheduled', scheduledAt: scheduledDate.toISOString(), totalRecipients: campaign.recipients.length },
    });

    revalidatePath('/campaigns');
    return NextResponse.redirect(safeRedirect(request, '/campaigns'), { status: 303 });
  }

  // Immediate launch

  const { queued } = await launchCampaignImmediately({ campaign, prisma, enqueueCampaignSend });

  await writeAuditLog({
    userId: session.userId,
    action: AUDIT_ACTIONS.CAMPAIGN_DRAFT_CREATED,
    entityType: 'campaign',
    entityId: id,
    metadata: { action: 'launched', totalRecipients: campaign.recipients.length, queued },
  });

  revalidatePath('/campaigns');
  return NextResponse.redirect(safeRedirect(request, '/campaigns'), { status: 303 });
}
