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

  await prisma.department.delete({ where: { id } }).catch(() => {});

  // Re-index after deletion to keep menu numbers sequential
  const all = await prisma.department.findMany({ orderBy: { sortOrder: 'asc' } });
  for (let i = 0; i < all.length; i++) {
    if (all[i].sortOrder !== i + 1) {
      await prisma.department.update({ where: { id: all[i].id }, data: { sortOrder: i + 1 } });
    }
  }

  revalidatePath('/settings');
  return NextResponse.redirect(safeRedirect(request, '/settings'), { status: 303 });
}
