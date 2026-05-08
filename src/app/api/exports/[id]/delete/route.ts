import { NextResponse } from 'next/server';
import { safeRedirect } from '@/lib/safe-redirect';
import { revalidatePath } from 'next/cache';
import { unlink } from 'node:fs/promises';
import path from 'node:path';

import { getConfig } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import { getVerifiedSession } from '@/modules/auth/guards';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.redirect(safeRedirect(request, '/exports'), { status: 303 });
  }

  const run = await prisma.exportRun.findUnique({ where: { id } });
  if (run?.zipKey) {
    await unlink(path.join(getConfig().storage.exportRoot, run.zipKey)).catch(() => {});
  }

  await prisma.exportRun.delete({ where: { id } }).catch(() => {});
  revalidatePath('/exports');
  return NextResponse.redirect(safeRedirect(request, '/exports'), { status: 303 });
}
