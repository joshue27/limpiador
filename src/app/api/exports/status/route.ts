import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET() {
  const latest = await prisma.exportRun.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { id: true, status: true, updatedAt: true },
  });

  const digest = latest ? `${latest.id}:${latest.status}:${latest.updatedAt.toISOString()}` : 'empty';

  return NextResponse.json({ digest });
}
