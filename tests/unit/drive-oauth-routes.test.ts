import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getVerifiedSession: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(async () => undefined),
  revalidatePath: vi.fn(),
  generateAuthUrl: vi.fn(),
  getToken: vi.fn(),
  oauth2Constructor: vi.fn(),
}));

vi.mock('@/modules/auth/guards', () => ({ getVerifiedSession: mocks.getVerifiedSession }));
vi.mock('node:fs/promises', () => ({ readFile: mocks.readFile, writeFile: mocks.writeFile }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn((clientId: string, clientSecret: string, redirectUri: string) => {
        mocks.oauth2Constructor(clientId, clientSecret, redirectUri);
        return {
          generateAuthUrl: mocks.generateAuthUrl,
          getToken: mocks.getToken,
        };
      }),
    },
  },
}));

describe('drive oauth routes', () => {
  const previousAppUrl = process.env.APP_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_URL = 'https://limpiador.test';
    mocks.getVerifiedSession.mockResolvedValue({ userId: 'admin-1', role: 'ADMIN' });
    mocks.readFile.mockResolvedValue(JSON.stringify({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
      folderId: 'folder-123',
    }));
    mocks.generateAuthUrl.mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?mock=1');
    mocks.getToken.mockResolvedValue({ tokens: { refresh_token: 'refresh-token-123' } });
  });

  afterAll(() => {
    if (previousAppUrl === undefined) {
      delete process.env.APP_URL;
      return;
    }

    process.env.APP_URL = previousAppUrl;
  });

  it('redirects admins to the Google consent screen with offline access and consent prompt', async () => {
    const { GET } = await import('@/app/api/settings/drive/connect/route');

    const response = await GET(new Request('http://localhost/api/settings/drive/connect'));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://accounts.google.com/o/oauth2/v2/auth?mock=1');
    expect(mocks.oauth2Constructor).toHaveBeenCalledWith(
      'google-client-id',
      'google-client-secret',
      'https://limpiador.test/api/settings/drive/callback',
    );
    expect(mocks.generateAuthUrl).toHaveBeenCalledWith(expect.objectContaining({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/drive'],
    }));
  });

  it('redirects back to settings with a clear error when client credentials are missing', async () => {
    mocks.readFile.mockResolvedValueOnce(JSON.stringify({ folderId: 'folder-123' }));
    const { GET } = await import('@/app/api/settings/drive/connect/route');

    const response = await GET(new Request('http://localhost/api/settings/drive/connect'));
    const location = response.headers.get('location');

    expect(response.status).toBe(303);
    expect(location).toContain('/settings?');
    expect(new URL(location!).searchParams.get('driveNoticeType')).toBe('error');
    expect(new URL(location!).searchParams.get('driveNotice')).toBe('Guardá primero el client ID y client secret de Google Drive.');
    expect(mocks.generateAuthUrl).not.toHaveBeenCalled();
  });

  it('exchanges the code, stores the refresh token, and redirects with success notice', async () => {
    const { GET } = await import('@/app/api/settings/drive/callback/route');

    const response = await GET(new Request('http://localhost/api/settings/drive/callback?code=oauth-code-123'));
    const location = response.headers.get('location');

    expect(mocks.getToken).toHaveBeenCalledWith('oauth-code-123');
    expect(mocks.writeFile).toHaveBeenCalledOnce();
    const [, writtenContent] = mocks.writeFile.mock.calls[0] as unknown as [string, string];
    expect(JSON.parse(writtenContent)).toEqual({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
      folderId: 'folder-123',
      refreshToken: 'refresh-token-123',
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/settings');
    expect(response.status).toBe(303);
    expect(new URL(location!).searchParams.get('driveNoticeType')).toBe('success');
    expect(new URL(location!).searchParams.get('driveNotice')).toBe('Google Drive conectado correctamente. El refresh token quedó guardado.');
  });

  it('fails clearly when Google returns no refresh token', async () => {
    mocks.getToken.mockResolvedValueOnce({ tokens: {} });
    const { GET } = await import('@/app/api/settings/drive/callback/route');

    const response = await GET(new Request('http://localhost/api/settings/drive/callback?code=oauth-code-123'));
    const location = response.headers.get('location');

    expect(response.status).toBe(303);
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(new URL(location!).searchParams.get('driveNoticeType')).toBe('error');
    expect(new URL(location!).searchParams.get('driveNotice')).toBe('Google no devolvió refresh token. Revocá el acceso de la app en Google y volvé a conectar con prompt=consent.');
  });
});
