import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getVerifiedSession: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(async () => undefined),
  revalidatePath: vi.fn(),
}));

vi.mock('@/modules/auth/guards', () => ({ getVerifiedSession: mocks.getVerifiedSession }));
vi.mock('node:fs/promises', () => ({ readFile: mocks.readFile, writeFile: mocks.writeFile }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

describe('drive settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVerifiedSession.mockResolvedValue({ userId: 'admin-1', role: 'ADMIN' });
  });

  it('returns only non-sensitive drive fields and configured flags', async () => {
    mocks.readFile.mockResolvedValueOnce(JSON.stringify({
      clientId: 'google-client-id',
      clientSecret: 'super-secret',
      refreshToken: 'refresh-token',
      folderId: 'folder-123',
    }));

    const { GET } = await import('@/app/api/settings/drive/route');

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.clientId).toBe('google-client-id');
    expect(body.folderId).toBe('folder-123');
    expect(body.clientSecretConfigured).toBe(true);
    expect(body.refreshTokenConfigured).toBe(true);
    expect(body.configured).toBe(true);
    expect(body.clientSecret).toBeUndefined();
    expect(body.refreshToken).toBeUndefined();
  });

  it('keeps stored secrets when secret inputs are left blank', async () => {
    mocks.readFile.mockResolvedValueOnce(JSON.stringify({
      clientSecret: 'existing-secret',
      refreshToken: 'existing-refresh-token',
    }));

    const { POST } = await import('@/app/api/settings/drive/route');
    const formData = new FormData();
    formData.set('clientId', 'new-client-id');
    formData.set('clientSecret', '');
    formData.set('refreshToken', '');
    formData.set('folderId', 'folder-999');

    const response = await POST(new Request('http://localhost/api/settings/drive', { method: 'POST', body: formData }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.writeFile).toHaveBeenCalledOnce();
    const [, writtenContent] = mocks.writeFile.mock.calls[0] as unknown as [string, string];
    expect(JSON.parse(writtenContent)).toEqual({
      clientId: 'new-client-id',
      clientSecret: 'existing-secret',
      refreshToken: 'existing-refresh-token',
      folderId: 'folder-999',
    });
  });
});
