import { NextResponse } from 'next/server';
import { safeRedirect } from '@/lib/safe-redirect';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/modules/auth/guards';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission('campaigns');

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.redirect(safeRedirect(request, '/campaigns'), { status: 303 });
  }

  await prisma.campaignRecipient.deleteMany({ where: { campaignId: id } });
  await prisma.campaign.delete({ where: { id } });
  revalidatePath('/campaigns');
  return NextResponse.redirect(safeRedirect(request, '/campaigns'), { status: 303 });
}
