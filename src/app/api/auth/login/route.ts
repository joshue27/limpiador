import { NextResponse, type NextRequest } from 'next/server';

import { getConfig } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rate-limit';
import { clientIp, userAgent } from '@/lib/request';
import { generateNumericCode } from '@/modules/auth/codes';
import { hashPasswordSha256, verifyPasswordDual } from '@/modules/auth/password';
import { setSessionCookie } from '@/modules/auth/session';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import { sendVerificationEmail, isEmailConfigured } from '@/modules/email/sender';
import { sha256 } from '@/shared/crypto';

const SAFE_LOGIN_ERROR = 'No pudimos iniciar sesión con esos datos.';

function safeLoginResponse(status: number) {
  return NextResponse.json(
    { error: status === 429 ? 'Demasiados intentos. Probá de nuevo en unos minutos.' : SAFE_LOGIN_ERROR },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: NextRequest) {
  const config = getConfig();
  const ip = clientIp(request);
  const ua = userAgent(request);
  const body = (await request.json().catch(() => null)) as {
    email?: string;
    hash?: string;
    password?: string;
  } | null;
  const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const hash = typeof body?.hash === 'string' ? body.hash : '';
  const effectiveHash = hash || (password ? await sha256(password) : '');

  const ipRate = await checkRateLimit(`login:ip:${ip}`, config.rateLimits.login.max, config.rateLimits.login.windowSeconds, {
    policy: 'fail-closed',
  });
  const emailRate = email
    ? await checkRateLimit(`login:email:${email}`, config.rateLimits.login.max, config.rateLimits.login.windowSeconds, {
        policy: 'fail-closed',
      })
    : { allowed: true as const, remaining: 0, resetAt: Date.now() };

  if (!ipRate.allowed || !emailRate.allowed) {
    await writeAuditLog({
      action: AUDIT_ACTIONS.LOGIN_RATE_LIMITED,
      metadata: { email: email || undefined },
      ipAddress: ip,
      userAgent: ua,
    });
    return safeLoginResponse(429);
  }

  if (!email || !effectiveHash) {
    await writeAuditLog({ action: AUDIT_ACTIONS.LOGIN_FAILED, metadata: { reason: 'missing_credentials' }, ipAddress: ip, userAgent: ua });
    return safeLoginResponse(401);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const passwordResult = user ? await verifyPasswordDual(effectiveHash, password, user.passwordHash) : { valid: false as const };

  if (!user || !passwordResult.valid) {
    await writeAuditLog({
      userId: user?.id,
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      metadata: { email },
      ipAddress: ip,
      userAgent: ua,
    });
    return safeLoginResponse(401);
  }

  if (user.status !== 'ACTIVE') {
    await writeAuditLog({
      userId: user.id,
      action: AUDIT_ACTIONS.LOGIN_DISABLED,
      metadata: { email },
      ipAddress: ip,
      userAgent: ua,
    });
    return safeLoginResponse(401);
  }

  // Weekly verification: if not verified in 7 days, send code via email
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const needsVerification = !user.verifiedAt || user.verifiedAt < weekAgo;
  const emailOk = await isEmailConfigured();
  const upgradedPasswordHash = passwordResult.upgraded ? await hashPasswordSha256(effectiveHash) : null;

  if (needsVerification && emailOk) {
    const code = generateNumericCode();
    await prisma.user.update({
      where: { id: user.id },
      data: { verificationCode: code, ...(upgradedPasswordHash ? { passwordHash: upgradedPasswordHash } : {}) },
    });
    // Send email in background - don't block login
    sendVerificationEmail(user.email, user.name || user.email, code).catch((error) => {
      console.error('[auth/login] verification email failed', error instanceof Error ? error.message : error);
    });
    return NextResponse.json({ verifyRequired: true }, { headers: { 'Cache-Control': 'no-store' } });
  }

  await setSessionCookie({ userId: user.id, email: user.email, name: user.name, role: user.role });
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), ...(upgradedPasswordHash ? { passwordHash: upgradedPasswordHash } : {}) },
  });
  await writeAuditLog({
    userId: user.id,
    action: AUDIT_ACTIONS.LOGIN_SUCCEEDED,
    ipAddress: ip,
    userAgent: ua,
  });

  return NextResponse.json({ ok: true, role: user.role }, { headers: { 'Cache-Control': 'no-store' } });
}
