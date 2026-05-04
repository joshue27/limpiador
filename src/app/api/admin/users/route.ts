import { NextResponse } from 'next/server';
import { safeRedirect } from '@/lib/safe-redirect';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import { getVerifiedSession } from '@/modules/auth/guards';
import { hashPasswordSha256 } from '@/modules/auth/password';
import { sha256 } from '@/shared/crypto';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.redirect(safeRedirect(request, '/settings'), { status: 303 });
  }

  const formData = await request.formData();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const name = String(formData.get('name') ?? '').trim() || null;
  // Accept `hash` (SHA-256 from admin form) or `password` (raw, legacy).
  const hash = String(formData.get('hash') ?? '') || String(formData.get('password') ?? '');
  const rawPassword = String(formData.get('password') ?? '');
  const role = String(formData.get('role') ?? 'OPERATOR');

  if (!email || hash.length < 8 || !['ADMIN', 'OPERATOR'].includes(role)) {
    return NextResponse.redirect(safeRedirect(request, '/settings'), { status: 303 });
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return NextResponse.redirect(safeRedirect(request, '/settings'), { status: 303 });
  }

  // If the admin form sent raw `password` instead of `hash`, compute SHA-256 server-side.
  const sha256Hex = formData.get('hash') ? hash : await sha256(rawPassword);

  await prisma.user.create({
    data: { email, name, passwordHash: await hashPasswordSha256(sha256Hex), role: role as 'ADMIN' | 'OPERATOR' },
  });

  await writeAuditLog({
    userId: session.userId,
    action: AUDIT_ACTIONS.ADMIN_BOOTSTRAP_CREATED,
    entityType: 'user',
    metadata: { email, role },
  });

  revalidatePath('/settings');
  return NextResponse.redirect(safeRedirect(request, '/settings'), { status: 303 });
}
