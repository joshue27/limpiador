import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { readFile, writeFile } from 'node:fs/promises';

import { settingsFilePath } from '@/lib/settings-files';
import { getVerifiedSession } from '@/modules/auth/guards';

export const runtime = 'nodejs';

const SETTINGS_FILE = settingsFilePath('routing-menu.txt');

async function readRoutingMenu(): Promise<string> {
  try {
    return await readFile(SETTINGS_FILE, 'utf-8');
  } catch {
    return `Hola 👋 ¿Con qué área quiere comunicarse?

1. Atención al Estudiante
2. Contabilidad
3. Coordinación Académica
4. Ventas
5. Informática

Responda con el número del área.`;
  }
}

export async function GET() {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const text = await readRoutingMenu();
  return NextResponse.json({ text });
}

export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const body = await request.json() as { text?: string };
  const text = body?.text?.trim();
  if (!text) {
    return NextResponse.json({ error: 'Texto requerido' }, { status: 400 });
  }

  await writeFile(SETTINGS_FILE, text, 'utf-8');
  revalidatePath('/settings');
  return NextResponse.json({ ok: true });
}
