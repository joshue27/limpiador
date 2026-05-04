import { NextResponse } from 'next/server';
import { safeRedirect } from '@/lib/safe-redirect';

import { prisma } from '@/lib/prisma';
import { auditDeniedAccess, getVerifiedSession } from '@/modules/auth/guards';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getVerifiedSession();
  if (!session) {
    await auditDeniedAccess({ request, session, entityType: 'user', entityId: id, reason: 'unauthenticated' });
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  if (session.role !== 'ADMIN') {
    await auditDeniedAccess({ request, session, entityType: 'user', entityId: id, reason: 'forbidden_role' });
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const form = await request.formData();
  const departmentIds = form.getAll('departmentId').filter((value): value is string => typeof value === 'string');
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });
  const activeDepartments = await prisma.department.findMany({ where: { id: { in: departmentIds }, active: true }, select: { id: true } });

  await prisma.$transaction(async (tx) => {
    await tx.userDepartment.deleteMany({ where: { userId: id } });
    if (activeDepartments.length) {
      await tx.userDepartment.createMany({
        data: activeDepartments.map((department) => ({ userId: id, departmentId: department.id })),
        skipDuplicates: true,
      });
    }
  });

  await writeAuditLog({
    userId: session.userId,
    action: AUDIT_ACTIONS.USER_DEPARTMENTS_UPDATED,
    entityType: 'user',
    entityId: id,
    metadata: { departmentIds: activeDepartments.map((department) => department.id) },
  });
  return NextResponse.redirect(safeRedirect(request, '/settings'), { status: 303 });
}
