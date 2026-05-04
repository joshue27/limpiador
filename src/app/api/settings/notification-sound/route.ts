import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { getVerifiedSession } from '@/modules/auth/guards';

export const runtime = 'nodejs';

const SOUND_DIR = path.join(process.cwd(), 'public');

export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get('sound') as File | null;
  const type = String(formData.get('type') ?? 'message');

  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'Archivo de audio requerido' }, { status: 400 });
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Máximo 5MB' }, { status: 400 });
  }

  const filename = type === 'transfer' ? 'notification-transfer.mp3' : 'notification-message.mp3';
  await mkdir(SOUND_DIR, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(SOUND_DIR, filename), buffer);

  revalidatePath('/settings');
  return NextResponse.json({ ok: true });
}
