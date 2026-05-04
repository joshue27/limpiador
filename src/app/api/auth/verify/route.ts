import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { checkAuthRateLimit, checkSensitiveAuthRateLimit } from '@/lib/request';
import { isSixDigitCode } from '@/modules/auth/codes';
import { setSessionCookie } from '@/modules/auth/session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const rate = await checkAuthRateLimit('auth-verify', request);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Probá nuevamente más tarde.' },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => null)) as { email?: string; code?: string } | null;
  const email = body?.email?.toLowerCase().trim();
  const code = body?.code?.trim();

  if (email) {
    const identityRate = await checkSensitiveAuthRateLimit('auth-verify', request, email);
    if (!identityRate.allowed) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Probá nuevamente más tarde.' },
        { status: 429 },
      );
    }
  }

  if (!email || !code || !isSixDigitCode(code)) {
    return NextResponse.json({ error: 'Código inválido' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true, verificationCode: true, status: true },
  });

  if (!user || user.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Código inválido' }, { status: 400 });
  }

  if (user.verificationCode !== code) {
    return NextResponse.json({ error: 'Código inválido' }, { status: 400 });
  }

  // Code is correct - mark as verified and clear the code
  await prisma.user.update({
    where: { id: user.id },
    data: { verifiedAt: new Date(), verificationCode: null },
  });

  await setSessionCookie({ userId: user.id, email: user.email, name: user.name, role: user.role });

  return NextResponse.json({ ok: true });
}
