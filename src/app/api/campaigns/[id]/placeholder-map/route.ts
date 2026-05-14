import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { safeRedirect } from '@/lib/safe-redirect';
import { requirePermission } from '@/modules/auth/guards';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission('campaigns');

  const formData = await request.formData();
  const bodyPlaceholderMap: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('placeholder_')) continue;
    const placeholder = key.replace('placeholder_', '').trim();
    const column = String(value ?? '').trim();
    bodyPlaceholderMap[placeholder] = column;
  }

  await prisma.campaign.update({
    where: { id },
    data: { bodyPlaceholderMap },
  });

  revalidatePath('/campaigns');
  return NextResponse.redirect(safeRedirect(request, '/campaigns'), { status: 303 });
}
