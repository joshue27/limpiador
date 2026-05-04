import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { readFile, writeFile } from 'node:fs/promises';

import { createOperationalError } from '@/lib/errors';
import { settingsFilePath } from '@/lib/settings-files';
import { getVerifiedSession } from '@/modules/auth/guards';
import { createDriveOauthClient, driveOauthErrorMessage, driveSettingsNoticeRedirect } from '@/modules/drive/oauth';
import type { DriveSettings } from '@/modules/drive/settings';

export const runtime = 'nodejs';

const DRIVE_FILE = settingsFilePath('drive.json');

export async function GET(request: Request) {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Solo administradores' }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const googleError = url.searchParams.get('error');
    if (googleError) {
      throw createOperationalError('DRIVE_OAUTH_GOOGLE_ERROR', `Google devolvió el error "${googleError}". Volvé a intentar la conexión.`, { statusCode: 400 });
    }

    const code = url.searchParams.get('code')?.trim();
    if (!code) {
      throw createOperationalError('DRIVE_OAUTH_CODE_MISSING', 'Google no devolvió un código OAuth válido. Volvé a intentar la conexión.', { statusCode: 400 });
    }

    const stored = JSON.parse(await readFile(DRIVE_FILE, 'utf-8')) as DriveSettings;
    const oauth = createDriveOauthClient(stored, process.env.APP_URL ?? '');
    const { tokens } = await oauth.getToken(code);
    const refreshToken = tokens.refresh_token?.trim();

    if (!refreshToken) {
      throw createOperationalError(
        'DRIVE_OAUTH_REFRESH_TOKEN_MISSING',
        'Google no devolvió refresh token. Revocá el acceso de la app en Google y volvé a conectar con prompt=consent.',
        { statusCode: 400 },
      );
    }

    await writeFile(DRIVE_FILE, JSON.stringify({ ...stored, refreshToken }), 'utf-8');
    revalidatePath('/settings');

    return NextResponse.redirect(
      driveSettingsNoticeRedirect(request, 'Google Drive conectado correctamente. El refresh token quedó guardado.', 'success'),
      { status: 303 },
    );
  } catch (error) {
    return NextResponse.redirect(driveSettingsNoticeRedirect(request, driveOauthErrorMessage(error), 'error'), { status: 303 });
  }
}
