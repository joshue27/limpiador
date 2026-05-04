import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { writeFile, readFile } from 'node:fs/promises';

import { settingsFilePath } from '@/lib/settings-files';
import { getVerifiedSession } from '@/modules/auth/guards';

export const runtime = 'nodejs';

const SMTP_FILE = settingsFilePath('smtp.json');

async function readSmtpConfig(): Promise<{ host?: string; port?: string; user?: string; pass?: string; from?: string }> {
  try {
    const data = await readFile(SMTP_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export async function GET() {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const config = await readSmtpConfig();
  return NextResponse.json({
    host: config.host || '',
    port: config.port || '',
    user: config.user || '',
    from: config.from || '',
    passConfigured: Boolean(config.pass),
    configured: Boolean(config.host && config.user && config.pass),
  });
}

export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Solo administradores' }, { status: 403 });
  }

  const formData = await request.formData();
  const host = String(formData.get('host') ?? '').trim();
  const port = String(formData.get('port') ?? '').trim();
  const user = String(formData.get('user') ?? '').trim();
  const pass = String(formData.get('pass') ?? '').trim();
  const from = String(formData.get('from') ?? '').trim();

  const config: Record<string, string> = {};
  if (host) config.host = host;
  if (port) config.port = port;
  if (user) config.user = user;
  if (from) config.from = from;
  // Only update password if provided (don't clear it)
  if (pass) config.pass = pass;
  else {
    const existing = await readSmtpConfig();
    if (existing.pass) config.pass = existing.pass;
  }

  await writeFile(SMTP_FILE, JSON.stringify(config), 'utf-8');
  revalidatePath('/settings');
  return NextResponse.json({ ok: true });
}
