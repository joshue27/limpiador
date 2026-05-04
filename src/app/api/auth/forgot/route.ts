import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { checkAuthRateLimit, checkSensitiveAuthRateLimit } from '@/lib/request';
import { generateNumericCode } from '@/modules/auth/codes';
import { sendVerificationEmail } from '@/modules/email/sender';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const rate = await checkAuthRateLimit('auth-forgot', request);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Probá nuevamente más tarde.' },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.toLowerCase().trim();

  if (email) {
    const identityRate = await checkSensitiveAuthRateLimit('auth-forgot', request, email);
    if (!identityRate.allowed) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Probá nuevamente más tarde.' },
        { status: 429 },
      );
    }
  }

  if (!email) {
    return NextResponse.json({ error: 'Email requerido' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, status: true },
  });

  if (!user || user.status !== 'ACTIVE') {
    // Don't reveal if user exists - always return success
    return NextResponse.json({ ok: true });
  }

  const code = generateNumericCode();
  const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await prisma.user.update({
    where: { id: user.id },
    data: { resetCode: code, resetExpires: expires },
  });

  // Send email with code
  sendVerificationEmail(user.email, user.name || user.email, code).catch((error) => {
    console.error('[auth/forgot] reset email failed', error instanceof Error ? error.message : error);
  });

  return NextResponse.json({ ok: true });
}
