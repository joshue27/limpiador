import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { writeFile, readFile } from 'node:fs/promises';

import { settingsFilePath } from '@/lib/settings-files';
import { getVerifiedSession } from '@/modules/auth/guards';

export const runtime = 'nodejs';

const RETENTION_FILE = settingsFilePath('retention.json');

const DEFAULTS = {
  exportsDays: '30',
  auditDays: '90',
  mediaDays: '60',
  chatDays: '30',
  conversationsDays: '90',
  orphanedCleanup: 'true',
};

export async function GET() {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  try {
    const data = await readFile(RETENTION_FILE, 'utf-8');
    return NextResponse.json({ ...DEFAULTS, ...JSON.parse(data) });
  } catch {
    return NextResponse.json(DEFAULTS);
  }
}

export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Solo administradores' }, { status: 403 });
  }

  const formData = await request.formData();
  const config: Record<string, string> = {};

  for (const key of ['exportsDays', 'auditDays', 'mediaDays', 'chatDays', 'conversationsDays', 'orphanedCleanup']) {
    const val = String(formData.get(key) ?? '').trim();
    if (val) config[key] = val;
  }

  await writeFile(RETENTION_FILE, JSON.stringify(config), 'utf-8');
  revalidatePath('/settings');
  return NextResponse.json({ ok: true });
}
