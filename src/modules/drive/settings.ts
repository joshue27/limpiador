export type DriveSettings = {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  folderId?: string;
};

export type DriveSettingsResponse = {
  clientId: string;
  folderId: string;
  clientSecretConfigured: boolean;
  refreshTokenConfigured: boolean;
  configured: boolean;
  oauthCallbackUrl: string;
};

export function sanitizeDriveSettingsForResponse(
  stored: DriveSettings | null | undefined,
  options: { oauthCallbackUrl?: string } = {},
): DriveSettingsResponse {
  return {
    clientId: stored?.clientId || '',
    folderId: stored?.folderId || '',
    clientSecretConfigured: Boolean(stored?.clientSecret),
    refreshTokenConfigured: Boolean(stored?.refreshToken),
    configured: Boolean(stored?.clientId && stored?.clientSecret && stored?.refreshToken),
    oauthCallbackUrl: options.oauthCallbackUrl || '',
  };
}

export function mergeDriveSettings(existing: DriveSettings | null | undefined, incoming: DriveSettings): DriveSettings {
  const next: DriveSettings = {};

  if (incoming.clientId) next.clientId = incoming.clientId;
  if (incoming.folderId) next.folderId = incoming.folderId;

  if (incoming.clientSecret) {
    next.clientSecret = incoming.clientSecret;
  } else if (existing?.clientSecret) {
    next.clientSecret = existing.clientSecret;
  }

  if (incoming.refreshToken) {
    next.refreshToken = incoming.refreshToken;
  } else if (existing?.refreshToken) {
    next.refreshToken = existing.refreshToken;
  }

  return next;
}

export function isDriveConfigured(settings: DriveSettings | null | undefined): settings is Required<Pick<DriveSettings, 'clientId' | 'clientSecret' | 'refreshToken'>> & DriveSettings {
  return Boolean(settings?.clientId && settings.clientSecret && settings.refreshToken);
}
