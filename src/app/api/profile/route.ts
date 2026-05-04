import { NextResponse } from 'next/server';
import { safeRedirect } from '@/lib/safe-redirect';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { getVerifiedSession } from '@/modules/auth/guards';
import { hashPasswordSha256, verifyPasswordDual } from '@/modules/auth/password';
import { sha256 } from '@/shared/crypto';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const formData = await request.formData();
  const name = String(formData.get('name') ?? '').trim() || undefined;
  const phone = String(formData.get('phone') ?? '').trim() || undefined;
  const currentPassword = String(formData.get('currentPassword') ?? '');
  const newPassword = String(formData.get('newPassword') ?? '');
  // New clients send pre-computed SHA-256 hashes.
  const currentHash = String(formData.get('currentHash') ?? '');
  const newHash = String(formData.get('newHash') ?? '');

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name || null;
  if (phone !== undefined) data.phone = phone || null;

  // Only update password if current verification succeeds.
  // New clients send `currentHash` (SHA-256); old clients send `currentPassword` (raw).
  const effectiveCurrentHash = currentHash || (currentPassword ? await sha256(currentPassword) : '');
  const effectiveNewHashRaw = newHash || (newPassword.length >= 8 ? await sha256(newPassword) : '');
  if (effectiveCurrentHash && effectiveNewHashRaw) {
    const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { passwordHash: true } });
    if (user) {
      const verifyResult = await verifyPasswordDual(effectiveCurrentHash, currentPassword, user.passwordHash);
      if (verifyResult.valid) {
        data.passwordHash = await hashPasswordSha256(effectiveNewHashRaw);
        // If old-style fallback was used, upgrade the stored hash (handled by login next time,
        // but we can also upgrade here proactively).
        if (verifyResult.upgraded) {
          await prisma.user.update({ where: { id: session.userId }, data: { passwordHash: await hashPasswordSha256(effectiveCurrentHash) } });
        }
      }
    }
  }

  if (Object.keys(data).length > 0) {
    await prisma.user.update({ where: { id: session.userId }, data });
  }

  revalidatePath('/settings');
  return NextResponse.redirect(safeRedirect(request, '/settings'), { status: 303 });
}
