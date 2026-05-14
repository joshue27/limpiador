import { NextResponse } from 'next/server';
import { readFile, writeFile } from 'node:fs/promises';

import { getConfig } from '@/lib/config';
import { settingsFilePath } from '@/lib/settings-files';
import { getVerifiedSession } from '@/modules/auth/guards';

export const runtime = 'nodejs';

const SETTINGS_FILE = settingsFilePath('timezone.json');

async function readTimezoneFile(): Promise<string | null> {
  try {
    const data = await readFile(SETTINGS_FILE, 'utf-8');
    const parsed = JSON.parse(data) as { timezone?: string };
    return parsed.timezone?.trim() || null;
  } catch {
    return null;
  }
}

async function writeTimezoneFile(timezone: string) {
  await writeFile(SETTINGS_FILE, JSON.stringify({ timezone }), 'utf-8');
}

/**
 * Returns the currently active timezone (env var or saved setting).
 */
export async function GET() {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Solo administradores' }, { status: 403 });
  }

  const saved = await readTimezoneFile();
  const effective = getConfig().timezone;

  return NextResponse.json({
    timezone: saved || effective,
    effective,
    source: saved ? 'saved' : 'env',
  });
}

/**
 * Save a timezone setting.
 */
export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Solo administradores' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { timezone?: string } | null;
  const tz = body?.timezone?.trim();
  if (!tz) {
    return NextResponse.json({ error: 'Zona horaria requerida' }, { status: 400 });
  }

  // Validate by trying to use it
  try {
    new Intl.DateTimeFormat('es', { timeZone: tz }).format(new Date());
  } catch {
    return NextResponse.json({ error: `Zona horaria inválida: "${tz}"` }, { status: 400 });
  }

  await writeTimezoneFile(tz);
  return NextResponse.json({ ok: true, timezone: tz });
}
