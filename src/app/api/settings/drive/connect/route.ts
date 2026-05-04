import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';

import { settingsFilePath } from '@/lib/settings-files';
import { getVerifiedSession } from '@/modules/auth/guards';
import { createDriveOauthClient, DRIVE_OAUTH_SCOPE, driveOauthErrorMessage, driveSettingsNoticeRedirect } from '@/modules/drive/oauth';
import type { DriveSettings } from '@/modules/drive/settings';

export const runtime = 'nodejs';

const DRIVE_FILE = settingsFilePath('drive.json');

export async function GET(request: Request) {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Solo administradores' }, { status: 403 });
  }

  try {
    const stored = JSON.parse(await readFile(DRIVE_FILE, 'utf-8')) as DriveSettings;
    const oauth = createDriveOauthClient(stored, process.env.APP_URL ?? '');
    const authUrl = oauth.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [DRIVE_OAUTH_SCOPE],
    });

    return NextResponse.redirect(authUrl, { status: 303 });
  } catch (error) {
    return NextResponse.redirect(driveSettingsNoticeRedirect(request, driveOauthErrorMessage(error), 'error'), { status: 303 });
  }
}
