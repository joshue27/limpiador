import { NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import { privateFileResponse } from '@/lib/private-files';
import { checkApiRateLimit, clientIp, userAgent } from '@/lib/request';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import { auditDeniedAccess, getVerifiedSession } from '@/modules/auth/guards';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getVerifiedSession();
  if (!session) {
    await auditDeniedAccess({ request, session, entityType: 'export_run', entityId: id, reason: 'unauthenticated' });
    return NextResponse.json({ error: 'No tiene permiso para descargar este export.' }, { status: 401 });
  }

  if (session.role !== 'ADMIN') {
    await writeAuditLog({
      userId: session.userId,
      action: AUDIT_ACTIONS.EXPORT_DOWNLOAD_DENIED,
      entityType: 'export_run',
      entityId: id,
      metadata: { reason: 'forbidden_role', role: session.role },
      ipAddress: clientIp(request),
      userAgent: userAgent(request),
    });
    return NextResponse.json({ error: 'No tiene permiso para descargar este export.' }, { status: 403 });
  }

  const rate = await checkApiRateLimit(`export-download:${session.userId}`, request);
  if (!rate.allowed) {
    await writeAuditLog({
      userId: session.userId,
      action: AUDIT_ACTIONS.EXPORT_DOWNLOAD_RATE_LIMITED,
      entityType: 'export_run',
      entityId: id,
      ipAddress: clientIp(request),
      userAgent: userAgent(request),
    });
    return NextResponse.json({ error: 'Too many download requests. Try again shortly.' }, { status: 429 });
  }

  const run = await prisma.exportRun.findUnique({ where: { id } });
  if (!run?.zipKey || run.status !== 'READY') {
    const errorMsg = (run?.countsJson as { error?: string } | null)?.error || 'Export is not ready yet';
    return NextResponse.json({ error: errorMsg }, { status: 404 });
  }

  await writeAuditLog({
    userId: session.userId,
    action: AUDIT_ACTIONS.EXPORT_DOWNLOADED,
    entityType: 'export_run',
    entityId: run.id,
    ipAddress: clientIp(request),
    userAgent: userAgent(request),
  });
  const safeFilename = `archivados-${run.month.replace(/→/g, 'a').replace(/[^\x20-\x7E]/g, '-')}.zip`;
  return privateFileResponse(getConfig().storage.exportRoot, run.zipKey, safeFilename, 'application/zip');
}
