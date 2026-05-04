import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { writeFile, readFile } from 'node:fs/promises';

import { settingsFilePath } from '@/lib/settings-files';
import { getVerifiedSession } from '@/modules/auth/guards';
import { maybeBuildDriveOauthRedirectUri } from '@/modules/drive/oauth';
import { mergeDriveSettings, sanitizeDriveSettingsForResponse, type DriveSettings } from '@/modules/drive/settings';

export const runtime = 'nodejs';

const DRIVE_FILE = settingsFilePath('drive.json');

export async function GET() {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  try {
    const stored = JSON.parse(await readFile(DRIVE_FILE, 'utf-8')) as DriveSettings;
    return NextResponse.json(sanitizeDriveSettingsForResponse(stored, { oauthCallbackUrl: maybeBuildDriveOauthRedirectUri(process.env.APP_URL) }));
  } catch {
    return NextResponse.json(sanitizeDriveSettingsForResponse(null, { oauthCallbackUrl: maybeBuildDriveOauthRedirectUri(process.env.APP_URL) }));
  }
}

export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Solo administradores' }, { status: 403 });
  }

  const formData = await request.formData();
  const clientId = String(formData.get('clientId') ?? '').trim();
  const clientSecret = String(formData.get('clientSecret') ?? '').trim();
  const refreshToken = String(formData.get('refreshToken') ?? '').trim();
  const folderId = String(formData.get('folderId') ?? '').trim();

  let existing: DriveSettings | null = null;
  try {
    existing = JSON.parse(await readFile(DRIVE_FILE, 'utf-8')) as DriveSettings;
  } catch {}

  const config = mergeDriveSettings(existing, { clientId, clientSecret, refreshToken, folderId });

  await writeFile(DRIVE_FILE, JSON.stringify(config), 'utf-8');
  revalidatePath('/settings');
  return NextResponse.json({ ok: true });
}
