import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = { userId: 'user-1', email: 'u@test.local', name: null, role: 'OPERATOR' };

vi.mock('@/modules/auth/guards', () => ({
  auditDeniedAccess: vi.fn(async () => undefined),
  getVerifiedSession: vi.fn(async () => session),
}));

vi.mock('@/modules/inbox/access', () => ({
  auditConversationAccessDenied: vi.fn(async () => undefined),
  canViewConversation: vi.fn(async () => false),
}));

vi.mock('@/modules/audit/audit', () => ({
  writeAuditLog: vi.fn(async () => undefined),
}));

vi.mock('@/lib/request', () => ({
  checkApiRateLimit: vi.fn(async () => ({ allowed: true })),
  clientIp: vi.fn(() => '203.0.113.10'),
  userAgent: vi.fn(() => 'vitest'),
}));

vi.mock('@/lib/config', () => ({
  getConfig: () => ({ storage: { mediaRoot: '/private/media' } }),
}));

vi.mock('@/lib/private-files', () => ({
  privateFileResponse: vi.fn(() => new Response('file', { status: 200 })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    mediaAsset: {
      findUnique: vi.fn(async () => ({
        id: 'asset-1',
        storageKey: 'safe/file.pdf',
        downloadStatus: 'READY',
        filename: 'file.pdf',
        waMediaId: 'wamedia-1',
        mimeType: 'application/pdf',
        message: { conversationId: 'conversation-1' },
      })),
    },
  },
}));

describe('media download authorization', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mirrors preview authorization and denies downloads for conversations the user cannot view', async () => {
    const { GET } = await import('@/app/api/media/[id]/download/route');
    const inboxAccess = await import('@/modules/inbox/access');
    const privateFiles = await import('@/lib/private-files');

    const response = await GET(new Request('https://app.test/api/media/asset-1/download'), {
      params: Promise.resolve({ id: 'asset-1' }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'No tiene permiso para descargar este archivo.' });
    expect(inboxAccess.canViewConversation).toHaveBeenCalledWith(session, 'conversation-1');
    expect(inboxAccess.auditConversationAccessDenied).toHaveBeenCalledWith({
      session,
      conversationId: 'conversation-1',
      reason: 'media_download_forbidden',
    });
    expect(privateFiles.privateFileResponse).not.toHaveBeenCalled();
  });
});
