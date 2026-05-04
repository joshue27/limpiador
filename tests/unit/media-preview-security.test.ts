import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';

import { getConversationMessageAttachmentPreviews } from '@/modules/inbox/message-attachments';
import { isSafeInlineMediaPreviewMime } from '@/modules/media/mime';

const session = { userId: 'user-1', email: 'u@test.local', name: null, role: 'ADMIN' as const };

vi.mock('@/modules/auth/guards', () => ({
  auditDeniedAccess: vi.fn(async () => undefined),
  getVerifiedSession: vi.fn(async () => session),
}));

vi.mock('@/modules/inbox/access', () => ({
  auditConversationAccessDenied: vi.fn(async () => undefined),
  canViewConversation: vi.fn(async () => true),
}));

vi.mock('@/lib/config', () => ({
  getConfig: () => ({ storage: { mediaRoot: '/private/media' } }),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    mediaAsset: {
      findUnique: vi.fn(async () => ({
        id: 'asset-svg-1',
        storageKey: 'safe/file.svg',
        downloadStatus: 'READY',
        filename: 'file.svg',
        waMediaId: 'wamedia-1',
        mimeType: 'image/svg+xml',
        message: { conversationId: 'conversation-1' },
      })),
    },
  },
}));

vi.mock('node:fs/promises', () => ({
  stat: vi.fn(async () => ({ isFile: () => true, size: 12 })),
}));

vi.mock('node:fs', () => ({
  createReadStream: vi.fn(() => Readable.from(Buffer.from('ok'))),
}));

describe('media preview security', () => {
  beforeEach(() => vi.clearAllMocks());

  it('blocks active mime types from inline preview classification', () => {
    expect(isSafeInlineMediaPreviewMime('image/svg+xml')).toBe(false);
    expect(isSafeInlineMediaPreviewMime('text/html')).toBe(false);
    expect(isSafeInlineMediaPreviewMime('application/xml')).toBe(false);
    expect(isSafeInlineMediaPreviewMime('image/png')).toBe(true);
    expect(isSafeInlineMediaPreviewMime('application/pdf')).toBe(true);
  });

  it('keeps risky image attachments as download links instead of inline previews', () => {
    const previews = getConversationMessageAttachmentPreviews({
      type: 'IMAGE',
      caption: 'Plano',
      mediaAssets: [
        {
          id: 'asset-svg-1',
          filename: 'plano.svg',
          mimeType: 'image/svg+xml',
          size: 10,
          downloadStatus: 'READY',
          isComprobante: false,
        },
      ],
    });

    expect(previews).toEqual([
      {
        kind: 'link',
        key: 'asset-svg-1',
        href: '/api/media/asset-svg-1/download',
        label: 'Adjunto: plano.svg',
        size: 10,
        isComprobante: false,
      },
    ]);
  });

  it('serves risky preview requests as attachments with nosniff', async () => {
    const { GET } = await import('@/app/api/media/[id]/preview/route');

    const response = await GET(new Request('https://app.test/api/media/asset-svg-1/preview'), {
      params: Promise.resolve({ id: 'asset-svg-1' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="file.svg"');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
  });
});
