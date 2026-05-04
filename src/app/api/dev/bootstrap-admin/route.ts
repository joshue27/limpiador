import { NextResponse, type NextRequest } from 'next/server';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { clientIp, userAgent } from '@/lib/request';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import { hashPasswordSha256 } from '@/modules/auth/password';
import { sha256 } from '@/shared/crypto';

export const runtime = 'nodejs';

function isBootstrapAdminEnabled(request: Request) {
  const installFlag = process.env.ALLOW_DEV_BOOTSTRAP_ADMIN === 'true' || process.env.ALLOW_DEV_BOOTSTRAP_ADMIN === '1';
  const setupSecret = process.env.DEV_BOOTSTRAP_ADMIN_SECRET?.trim() ?? '';

  if (!installFlag && !setupSecret) {
    return { allowed: false as const, reason: 'bootstrap_not_enabled' };
  }

  if (setupSecret) {
    const providedSecret = request.headers.get('x-setup-secret')?.trim() ?? '';
    if (!providedSecret || providedSecret !== setupSecret) {
      return { allowed: false as const, reason: 'invalid_setup_secret' };
    }
  }

  return { allowed: true as const };
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Bootstrap is disabled in production' }, { status: 403 });
  }

  const bootstrapGate = isBootstrapAdminEnabled(request);
  if (!bootstrapGate.allowed) {
    logger.warn('dev_bootstrap_admin_rejected', {
      reason: bootstrapGate.reason,
      ipAddress: clientIp(request),
      userAgent: userAgent(request),
      nodeEnv: process.env.NODE_ENV,
    });
    return NextResponse.json({ error: 'Bootstrap requires explicit setup enablement' }, { status: 403 });
  }

  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    return NextResponse.json({ error: 'Bootstrap is available only before the first user exists' }, { status: 409 });
  }

  const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
  const email = body?.email?.toLowerCase().trim();
  const password = body?.password;

  if (!email || !password || password.length < 12) {
    return NextResponse.json({ error: 'Email and a password with at least 12 characters are required' }, { status: 400 });
  }

  // Bootstrap page sends plaintext password via fetch — hash with SHA-256
  // server-side before bcrypt so the stored format matches all other endpoints.
  const sha256Hex = await sha256(password);
  const user = await prisma.user.create({ data: { email, passwordHash: await hashPasswordSha256(sha256Hex), role: 'ADMIN' } });
  await writeAuditLog({
    userId: user.id,
    action: AUDIT_ACTIONS.ADMIN_BOOTSTRAP_CREATED,
    entityType: 'user',
    entityId: user.id,
    ipAddress: clientIp(request),
    userAgent: userAgent(request),
  });

  return NextResponse.json({ ok: true });
}
