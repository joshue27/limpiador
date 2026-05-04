import { NextResponse } from 'next/server';
import { safeRedirect } from '@/lib/safe-redirect';
import { revalidatePath } from 'next/cache';

import { logger, serializeError } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import { getVerifiedSession } from '@/modules/auth/guards';
import { hashPasswordSha256 } from '@/modules/auth/password';
import { sha256 } from '@/shared/crypto';

export const runtime = 'nodejs';

function redirectToSettings(
  request: Request,
  options: { notice?: string; type?: 'success' | 'error'; userPage?: string } = {},
) {
  const url = new URL(safeRedirect(request, '/settings'));

  if (options.userPage) {
    url.searchParams.set('userPage', options.userPage);
  }

  if (options.notice) {
    url.searchParams.set('userNotice', options.notice);
    url.searchParams.set('userNoticeType', options.type ?? 'success');
  }

  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return redirectToSettings(request);
  }

  const formData = await request.formData();
  const action = String(formData.get('action') ?? '');
  const userPage = String(formData.get('userPage') ?? '').trim() || undefined;

  if (action === 'delete') {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, status: true },
    });

    if (!user) {
      return redirectToSettings(request, { notice: 'El usuario ya no existe.', type: 'error', userPage });
    }

    if (user.id === session.userId) {
      return redirectToSettings(request, { notice: 'No puede desactivar su propio usuario.', type: 'error', userPage });
    }

    if (user.role === 'ADMIN' && user.status === 'ACTIVE') {
      const activeAdminCount = await prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } });
      if (activeAdminCount <= 1) {
        return redirectToSettings(request, { notice: 'No se puede eliminar el último admin activo.', type: 'error', userPage });
      }
    }

    await prisma.user.update({ where: { id }, data: { status: 'DISABLED' } });
  } else if (action === 'hard_delete') {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, status: true, email: true },
    });

    if (!user) {
      return redirectToSettings(request, { notice: 'El usuario ya no existe.', type: 'error', userPage });
    }

    if (user.id === session.userId) {
      return redirectToSettings(request, { notice: 'No puede eliminar su propio usuario.', type: 'error', userPage });
    }

    if (user.role === 'ADMIN' && user.status === 'ACTIVE') {
      const activeAdminCount = await prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } });
      if (activeAdminCount <= 1) {
        return redirectToSettings(request, { notice: 'No se puede eliminar el último admin activo.', type: 'error', userPage });
      }
    }

    try {
      await prisma.user.delete({ where: { id } });
    } catch (error) {
      logger.error('admin_user_hard_delete_failed', {
        err: serializeError(error),
        targetUserId: id,
        actorUserId: session.userId,
        targetRole: user.role,
        targetStatus: user.status,
      });

      return redirectToSettings(request, {
        notice: 'No se pudo eliminar el usuario. Revise relaciones activas e inténtelo de nuevo.',
        type: 'error',
        userPage,
      });
    }
  } else if (action === 'enable') {
    await prisma.user.update({ where: { id }, data: { status: 'ACTIVE' } });
  } else {
    const role = String(formData.get('role') ?? '') as 'ADMIN' | 'OPERATOR';
    const name = String(formData.get('name') ?? '').trim() || undefined;
    const email = String(formData.get('email') ?? '').trim().toLowerCase() || undefined;
    const phone = String(formData.get('phone') ?? '').trim() || undefined;
    const hash = String(formData.get('hash') ?? '') || String(formData.get('password') ?? '');
    const rawPassword = String(formData.get('password') ?? '');
    const data: { role?: 'ADMIN' | 'OPERATOR'; passwordHash?: string; name?: string; email?: string; phone?: string; permissions?: Record<string, boolean> } = {};
    if (['ADMIN', 'OPERATOR'].includes(role)) data.role = role;
    if (name) data.name = name;
    if (email) data.email = email;
    if (phone !== undefined) data.phone = phone || undefined;
    if (hash.length >= 8) {
      const sha256Hex = formData.get('hash') ? hash : await sha256(rawPassword);
      data.passwordHash = await hashPasswordSha256(sha256Hex);
    }

    // Parse permissions from form data
    const perms: Record<string, boolean> = {};
    const modules = ['dashboard', 'inbox', 'chat', 'contacts', 'templates', 'campaigns', 'comprobantes', 'exports', 'audit'];
    for (const m of modules) {
      perms[m] = formData.get(`perm_${m}`) === 'on';
    }
    data.permissions = perms;
    if (Object.keys(data).length > 0) {
      await prisma.user.update({ where: { id }, data });
    }
  }

  await writeAuditLog({
    userId: session.userId,
    action: AUDIT_ACTIONS.USER_DEPARTMENTS_UPDATED,
    entityType: 'user',
    entityId: id,
    metadata: { action },
  });

  revalidatePath('/settings');
  return redirectToSettings(request, { userPage });
}
