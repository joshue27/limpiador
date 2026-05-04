import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  oauth2SetCredentials: vi.fn(),
  oauth2Constructor: vi.fn(),
  driveFactory: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  createReadStream: vi.fn(() => 'file-stream'),
  stat: vi.fn(async () => ({ size: 512 })),
}));

vi.mock('node:fs', () => ({ createReadStream: mocks.createReadStream }));
vi.mock('node:fs/promises', () => ({ stat: mocks.stat }));
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn((clientId: string, clientSecret: string) => {
        mocks.oauth2Constructor(clientId, clientSecret);
        return { setCredentials: mocks.oauth2SetCredentials };
      }),
    },
    drive: vi.fn((options: unknown) => {
      mocks.driveFactory(options);
      return { files: { list: mocks.list, create: mocks.create } };
    }),
  },
}));

describe('drive uploader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses OAuth2 refresh-token auth and creates nested folders before upload', async () => {
    mocks.list
      .mockResolvedValueOnce({ data: { files: [] } })
      .mockResolvedValueOnce({ data: { files: [] } });
    mocks.create
      .mockResolvedValueOnce({ data: { id: 'month-folder-id' } })
      .mockResolvedValueOnce({ data: { id: 'manual-folder-id' } })
      .mockResolvedValueOnce({ data: { id: 'file-id' } });

    const { uploadToDrive } = await import('@/modules/drive/uploader');

    const result = await uploadToDrive(
      {
        clientId: 'oauth-client-id',
        clientSecret: 'oauth-client-secret',
        refreshToken: 'oauth-refresh-token',
        folderId: 'root-folder-id',
      },
      'C:/tmp/export.zip',
      'export.zip',
      ['2026-05', 'manual-2026-05-02-143015'],
    );

    expect(mocks.oauth2Constructor).toHaveBeenCalledWith('oauth-client-id', 'oauth-client-secret');
    expect(mocks.oauth2SetCredentials).toHaveBeenCalledWith({ refresh_token: 'oauth-refresh-token' });
    expect(mocks.list).toHaveBeenNthCalledWith(1, expect.objectContaining({
      q: "name='2026-05' and mimeType='application/vnd.google-apps.folder' and 'root-folder-id' in parents and trashed=false",
    }));
    expect(mocks.list).toHaveBeenNthCalledWith(2, expect.objectContaining({
      q: "name='manual-2026-05-02-143015' and mimeType='application/vnd.google-apps.folder' and 'month-folder-id' in parents and trashed=false",
    }));
    expect(mocks.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      requestBody: { name: '2026-05', mimeType: 'application/vnd.google-apps.folder', parents: ['root-folder-id'] },
    }));
    expect(mocks.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      requestBody: { name: 'manual-2026-05-02-143015', mimeType: 'application/vnd.google-apps.folder', parents: ['month-folder-id'] },
    }));
    expect(mocks.create).toHaveBeenNthCalledWith(3, expect.objectContaining({
      requestBody: { name: 'export.zip', parents: ['manual-folder-id'] },
      media: { body: 'file-stream' },
    }));
    expect(result).toEqual({ folderId: 'manual-folder-id', fileName: 'export.zip', size: 512 });
  });
});
