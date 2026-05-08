import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

import { settingsFilePath } from '@/lib/settings-files';
import { getVerifiedSession } from '@/modules/auth/guards';

export const runtime = 'nodejs';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const SETTINGS_FILE = settingsFilePath('branding.json');

async function readSettings(): Promise<Record<string, string>> {
  try {
    const data = await readFile(SETTINGS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function writeSettings(settings: Record<string, string>) {
  await writeFile(SETTINGS_FILE, JSON.stringify(settings), 'utf-8');
}

export async function GET() {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Solo administradores' }, { status: 403 });
  }
  const settings = await readSettings();
  return NextResponse.json(settings);
}

export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Solo administradores' }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const type = String(formData.get('type') ?? '');
  const sidebarColor = String(formData.get('sidebarColor') ?? '');
  const accentColor = String(formData.get('accentColor') ?? '');

  // Handle color update
  if (sidebarColor || accentColor) {
    const settings = await readSettings();
    if (sidebarColor) settings.sidebarColor = sidebarColor;
    if (accentColor) settings.accentColor = accentColor;
    await writeSettings(settings);
    revalidatePath('/settings');
    return NextResponse.json({ ok: true });
  }

  // Handle file upload
  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 });
  }

  const maxSizes: Record<string, number> = { logo: 2 * 1024 * 1024, background: 10 * 1024 * 1024, favicon: 512 * 1024 };
  const maxSize = maxSizes[type] || 5 * 1024 * 1024;
  if (file.size > maxSize) {
    return NextResponse.json({ error: `Máximo ${(maxSize / 1024 / 1024).toFixed(0)}MB` }, { status: 400 });
  }

  const filenames: Record<string, string> = {
    logo: 'brand-logo.png',
    background: 'login-bg.jpg',
    favicon: 'favicon.ico',
  };

  const filename = filenames[type];
  if (!filename) {
    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
  }

  await mkdir(PUBLIC_DIR, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(PUBLIC_DIR, filename), buffer);

  revalidatePath('/settings');
  revalidatePath('/login');
  return NextResponse.json({ ok: true });
}
