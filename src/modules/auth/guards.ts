import { redirect } from 'next/navigation';

import { prisma } from '@/lib/prisma';
import { clientIp, userAgent } from '@/lib/request';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';

import { getCurrentSession, type AppSession, type SessionRole } from './session';

export async function getVerifiedSession(): Promise<AppSession | null> {
  const session = await getCurrentSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true, status: true, permissions: true },
  });

  if (!user || user.status !== 'ACTIVE') {
    await writeAuditLog({
      userId: user?.id,
      action: AUDIT_ACTIONS.SESSION_DISABLED,
      metadata: { email: session.email, reason: user ? 'disabled_user' : 'missing_user' },
    });
    return null;
  }

  return { userId: user.id, email: user.email, name: user.name, role: user.role, permissions: user.permissions as Record<string, boolean> | undefined };
}

export async function requireSession(): Promise<AppSession> {
  const session = await getVerifiedSession();
  if (!session) {
    redirect('/login');
  }

  return session;
}

export async function auditDeniedAccess(input: {
  request: Request;
  session?: AppSession | null;
  entityType?: string;
  entityId?: string;
  reason: 'unauthenticated' | 'forbidden_role' | 'disabled_or_missing_user';
}) {
  await writeAuditLog({
    userId: input.session?.userId,
    action: AUDIT_ACTIONS.ACCESS_DENIED,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: { reason: input.reason, role: input.session?.role },
    ipAddress: clientIp(input.request),
    userAgent: userAgent(input.request),
  });
}

export async function requirePermission(key: string) {
  const session = await requireSession();

  if (session.role === 'ADMIN') return session;

  if (session.permissions?.[key] !== true) {
    redirect('/dashboard');
  }

  return session;
}

export async function requireRole(allowedRoles: SessionRole[]) {
  const session = await requireSession();
  if (!allowedRoles.includes(session.role)) {
    redirect('/forbidden');
  }

  return session;
}
