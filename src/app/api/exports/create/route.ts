import { NextResponse } from 'next/server';
import { safeRedirect } from '@/lib/safe-redirect';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import { getVerifiedSession } from '@/modules/auth/guards';
import { enqueueChatExport, enqueueContactExport, enqueueConversationExport, enqueueExportGeneration } from '@/modules/queue/queues';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.redirect(safeRedirect(request, '/exports'), { status: 303 });
  }

  const formData = await request.formData();
  const from = String(formData.get('from') ?? '').trim();
  const to = String(formData.get('to') ?? '').trim();
  const type = String(formData.get('type') ?? 'media').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.redirect(safeRedirect(request, '/exports'), { status: 303 });
  }

  const label = type === 'conversations' ? `Conversaciones: ${from} al ${to}` : type === 'contacts' ? `Contactos: ${from} al ${to}` : type === 'chat' ? `Chat interno: ${from} al ${to}` : `${from} al ${to}`;
  const run = await prisma.exportRun.create({ data: { month: label, createdById: session.userId } });

  try {
    if (type === 'conversations') {
      await enqueueConversationExport(run.id, from, to);
    } else if (type === 'contacts') {
      await enqueueContactExport(run.id, from, to);
    } else if (type === 'chat') {
      await enqueueChatExport(run.id, from, to);
    } else {
      await enqueueExportGeneration(run.id, from, to);
    }
  } catch {
    await prisma.exportRun.update({ where: { id: run.id }, data: { status: 'FAILED' } });
  }

  await writeAuditLog({ userId: session.userId, action: AUDIT_ACTIONS.EXPORT_REQUESTED, entityType: 'export_run', entityId: run.id, metadata: { from, to, type } });
  revalidatePath('/exports');
  return NextResponse.redirect(safeRedirect(request, '/exports'), { status: 303 });
}
