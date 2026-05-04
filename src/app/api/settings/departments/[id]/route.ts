import { NextResponse } from 'next/server';
import { safeRedirect } from '@/lib/safe-redirect';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { getVerifiedSession } from '@/modules/auth/guards';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.redirect(safeRedirect(request, '/settings'), { status: 303 });
  }

  const formData = await request.formData();
  const name = String(formData.get('name') ?? '').trim();
  if (name) {
    await prisma.department.update({ where: { id }, data: { name } });
  }

  revalidatePath('/settings');
  return NextResponse.redirect(safeRedirect(request, '/settings'), { status: 303 });
}
