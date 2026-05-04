import { NextResponse } from 'next/server';
import { safeRedirect } from '@/lib/safe-redirect';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { getVerifiedSession } from '@/modules/auth/guards';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.redirect(safeRedirect(request, '/settings'), { status: 303 });
  }

  const formData = await request.formData();
  const name = String(formData.get('name') ?? '').trim();
  const code = String(formData.get('code') ?? '').trim().toUpperCase();

  if (!name || !code) {
    return NextResponse.redirect(safeRedirect(request, '/settings'), { status: 303 });
  }

  const maxSort = await prisma.department.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
  await prisma.department.create({
    data: { name, code, sortOrder: (maxSort?.sortOrder ?? 0) + 1 },
  });

  // Re-index all departments to keep sortOrder sequential
  await reindexDepartments();

  revalidatePath('/settings');
  return NextResponse.redirect(safeRedirect(request, '/settings'), { status: 303 });
}

async function reindexDepartments() {
  const all = await prisma.department.findMany({ orderBy: { sortOrder: 'asc' } });
  for (let i = 0; i < all.length; i++) {
    if (all[i].sortOrder !== i + 1) {
      await prisma.department.update({ where: { id: all[i].id }, data: { sortOrder: i + 1 } });
    }
  }
}
