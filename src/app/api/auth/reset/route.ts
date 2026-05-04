import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { checkAuthRateLimit, checkSensitiveAuthRateLimit } from '@/lib/request';
import { isSixDigitCode } from '@/modules/auth/codes';
import { hashPasswordSha256 } from '@/modules/auth/password';
import { sha256 } from '@/shared/crypto';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const rate = await checkAuthRateLimit('auth-reset', request);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Probá nuevamente más tarde.' },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    email?: string;
    code?: string;
    hash?: string;
    password?: string;
  } | null;
  const email = body?.email?.toLowerCase().trim();
  const code = body?.code?.trim();
  // Accept `hash` (SHA-256 from client) OR `password` (raw plaintext, legacy).
  // `hash` takes priority for new clients; `password` is a fallback for
  // clients that haven't migrated yet.
  const hash = body?.hash || body?.password;

  if (email) {
    const identityRate = await checkSensitiveAuthRateLimit('auth-reset', request, email);
    if (!identityRate.allowed) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Probá nuevamente más tarde.' },
        { status: 429 },
      );
    }
  }

  if (!email || !code || !isSixDigitCode(code) || !hash || hash.length < 8) {
    return NextResponse.json(
      { error: 'Todos los campos son requeridos. La contraseña debe tener al menos 8 caracteres.' },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, resetCode: true, resetExpires: true, status: true },
  });

  if (!user || user.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Código inválido o expirado.' }, { status: 400 });
  }

  if (user.resetCode !== code) {
    return NextResponse.json({ error: 'Código inválido o expirado.' }, { status: 400 });
  }

  if (!user.resetExpires || user.resetExpires < new Date()) {
    return NextResponse.json({ error: 'Código inválido o expirado.' }, { status: 400 });
  }

  // New clients send pre-computed SHA-256 as `hash`.
  // The forgot-password page (unchanged) still sends raw `password` — we
  // compute SHA-256 server-side for those requests.
  const sha256Hex = body?.hash || (body?.password ? await sha256(body.password) : '');

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPasswordSha256(sha256Hex),
      resetCode: null,
      resetExpires: null,
    },
  });

  return NextResponse.json({ ok: true });
}
