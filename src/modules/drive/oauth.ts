import { google } from 'googleapis';

import { createOperationalError, isOperationalError } from '@/lib/errors';
import { safeRedirect } from '@/lib/safe-redirect';

import type { DriveSettings } from './settings';

export const DRIVE_OAUTH_CALLBACK_PATH = '/api/settings/drive/callback';
export const DRIVE_OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive';

export function buildDriveOauthRedirectUri(appUrl: string): string {
  try {
    return new URL(DRIVE_OAUTH_CALLBACK_PATH, appUrl).toString();
  } catch {
    throw createOperationalError(
      'DRIVE_OAUTH_APP_URL_INVALID',
      'APP_URL es inválida. Configure una URL pública absoluta antes de conectar Google Drive.',
      { statusCode: 500 },
    );
  }
}

export function maybeBuildDriveOauthRedirectUri(appUrl: string | undefined): string {
  if (!appUrl?.trim()) return '';

  try {
    return buildDriveOauthRedirectUri(appUrl);
  } catch {
    return '';
  }
}

export function createDriveOauthClient(settings: DriveSettings, appUrl: string) {
  if (!settings.clientId || !settings.clientSecret) {
    throw createOperationalError(
      'DRIVE_OAUTH_CLIENT_MISSING',
      'Guardá primero el client ID y client secret de Google Drive.',
      { statusCode: 400 },
    );
  }

  return new google.auth.OAuth2(settings.clientId, settings.clientSecret, buildDriveOauthRedirectUri(appUrl));
}

export function driveSettingsNoticeRedirect(request: Request, notice: string, type: 'success' | 'error' = 'success') {
  const url = new URL(safeRedirect(request, '/settings'));
  url.searchParams.set('driveNotice', notice);
  url.searchParams.set('driveNoticeType', type);
  return url.toString();
}

export function driveOauthErrorMessage(error: unknown): string {
  if (isOperationalError(error)) {
    return error.message;
  }

  return 'No se pudo completar la conexión con Google Drive. Revise APP_URL, el redirect URI y vuelva a intentar.';
}
