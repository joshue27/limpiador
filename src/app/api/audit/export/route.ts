import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { clientIp, userAgent } from '@/lib/request';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { auditParamsFromUrl, auditWhereFromParams } from '@/modules/audit/filters';
import { writeAuditLog } from '@/modules/audit/audit';
import { auditDeniedAccess, getVerifiedSession } from '@/modules/auth/guards';

export const runtime = 'nodejs';

function csvCell(value: unknown) {
  const text = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const session = await getVerifiedSession();
  if (!session) {
    await auditDeniedAccess({ request, session, entityType: 'audit_log', reason: 'unauthenticated' });
    return NextResponse.json({ error: 'No tiene permiso para exportar auditoría.' }, { status: 401 });
  }

  if (session.role !== 'ADMIN') {
    await writeAuditLog({
      userId: session.userId,
      action: AUDIT_ACTIONS.AUDIT_EXPORT_DENIED,
      entityType: 'audit_log',
      metadata: { reason: 'forbidden_role', role: session.role },
      ipAddress: clientIp(request),
      userAgent: userAgent(request),
    });
    return NextResponse.json({ error: 'No tiene permiso para exportar auditoría.' }, { status: 403 });
  }

  const filters = auditParamsFromUrl(url.searchParams);
  const logs = await prisma.auditLog.findMany({
    where: auditWhereFromParams(filters),
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });

  await writeAuditLog({
    userId: session.userId,
    action: AUDIT_ACTIONS.AUDIT_CSV_EXPORTED,
    entityType: 'audit_log',
    metadata: { filters, count: logs.length },
  });

  const header = ['created_at', 'action', 'user_email', 'entity_type', 'entity_id', 'ip_address', 'user_agent', 'metadata'];
  const rows = logs.map((log) => [
    log.createdAt.toISOString(),
    log.action,
    log.user?.email ?? '',
    log.entityType ?? '',
    log.entityId ?? '',
    log.ipAddress ?? '',
    log.userAgent ?? '',
    log.metadataJson ?? '',
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
