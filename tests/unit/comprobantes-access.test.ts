import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildComprobantesWhere } from '@/modules/comprobantes/where';

const operator = { userId: 'u1', email: 'op@example.com', name: null, role: 'OPERATOR' as const };
const admin = { userId: 'admin', email: 'admin@example.com', name: null, role: 'ADMIN' as const };

// ---------------------------------------------------------------------------
// Pure function tests — no mocks needed
// ---------------------------------------------------------------------------

describe('buildComprobantesWhere', () => {
  it('adds markedById filter for non-ADMIN users and defaults to isComprobante: true', () => {
    const where = buildComprobantesWhere(operator, {});
    expect(where).toEqual({
      isComprobante: true,
      markedById: 'u1',
    });
  });

  it('does NOT add markedById filter for ADMIN so they see all marked files', () => {
    const where = buildComprobantesWhere(admin, {});
    expect(where).toEqual({
      isComprobante: true,
    });
    expect(where).not.toHaveProperty('markedById');
  });

  it('allows explicit comprobante: false to show non-archived files (still ownership-filtered for operators)', () => {
    const where = buildComprobantesWhere(operator, { comprobante: false });
    expect(where).toEqual({
      isComprobante: false,
      markedById: 'u1',
    });
  });

  it('preserves additional filters (status, date range) alongside ownership filter', () => {
    const from = new Date('2026-04-01T00:00:00.000Z');
    const to = new Date('2026-04-30T23:59:59.999Z');

    const where = buildComprobantesWhere(operator, {
      status: 'READY',
      comprobante: true,
      from,
      to,
    });

    expect(where).toEqual({
      isComprobante: true,
      markedById: 'u1',
      downloadStatus: 'READY',
      createdAt: {
        gte: from,
        lte: to,
      },
    });
  });

  it('handles partial date range (only from)', () => {
    const from = new Date('2026-04-01T00:00:00.000Z');

    const where = buildComprobantesWhere(admin, { from });

    expect(where).toEqual({
      isComprobante: true,
      createdAt: {
        gte: from,
      },
    });
  });

  it('handles partial date range (only to)', () => {
    const to = new Date('2026-04-30T23:59:59.999Z');

    const where = buildComprobantesWhere(admin, { to });

    expect(where).toEqual({
      isComprobante: true,
      createdAt: {
        lte: to,
      },
    });
  });
});

// ---------------------------------------------------------------------------
// toggleArchivado tests — mocked dependencies
// ---------------------------------------------------------------------------

vi.mock('@/lib/prisma', () => ({
  prisma: {
    mediaAsset: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/modules/auth/guards', () => ({
  requireSession: vi.fn(),
}));

vi.mock('@/modules/inbox/access', () => ({
  canViewConversation: vi.fn(),
}));

vi.mock('@/modules/audit/audit', () => ({
  writeAuditLog: vi.fn(async () => undefined),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('toggleArchivado — ownership and access guards', () => {
  beforeEach(() => vi.clearAllMocks());

  function makeFormData(entries: Record<string, string>) {
    const fd = new FormData();
    for (const [key, value] of Object.entries(entries)) fd.set(key, value);
    return fd;
  }

  it('rejects unmark when non-admin tries to unmark another operator\'s comprobante', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { requireSession } = await import('@/modules/auth/guards');

    vi.mocked(requireSession).mockResolvedValue(operator);
    vi.mocked(prisma.mediaAsset.findUnique).mockResolvedValue({
      id: 'asset-1',
      isComprobante: true,
      markedById: 'another-op',
      message: { conversationId: 'conv-1' },
    } as never);
    vi.mocked(prisma.mediaAsset.update).mockResolvedValue(undefined as never);

    const { toggleArchivado } = await import('@/modules/comprobantes/actions');
    await toggleArchivado(makeFormData({ id: 'asset-1', isComprobante: 'false', confirmation: 'DESMARCAR' }));

    // Should NOT call update because the user doesn't own the mark
    expect(prisma.mediaAsset.update).not.toHaveBeenCalled();
  });

  it('allows unmark when the user is the one who marked it', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { requireSession } = await import('@/modules/auth/guards');

    vi.mocked(requireSession).mockResolvedValue(operator);
    vi.mocked(prisma.mediaAsset.findUnique).mockResolvedValue({
      id: 'asset-1',
      isComprobante: true,
      markedById: 'u1',
      message: { conversationId: 'conv-1' },
    } as never);
    vi.mocked(prisma.mediaAsset.update).mockResolvedValue(undefined as never);

    const { toggleArchivado } = await import('@/modules/comprobantes/actions');
    await toggleArchivado(makeFormData({ id: 'asset-1', isComprobante: 'false', confirmation: 'DESMARCAR' }));

    expect(prisma.mediaAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'asset-1' },
        data: expect.objectContaining({ isComprobante: false }),
      }),
    );
  });

  it('allows unmark when admin unmarks any comprobante (not the marker)', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { requireSession } = await import('@/modules/auth/guards');

    vi.mocked(requireSession).mockResolvedValue(admin);
    vi.mocked(prisma.mediaAsset.findUnique).mockResolvedValue({
      id: 'asset-1',
      isComprobante: true,
      markedById: 'another-op',
      message: { conversationId: 'conv-1' },
    } as never);
    vi.mocked(prisma.mediaAsset.update).mockResolvedValue(undefined as never);

    const { toggleArchivado } = await import('@/modules/comprobantes/actions');
    await toggleArchivado(makeFormData({ id: 'asset-1', isComprobante: 'false', confirmation: 'DESMARCAR' }));

    expect(prisma.mediaAsset.update).toHaveBeenCalled();
  });

  it('rejects mark when operator cannot view the conversation', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { requireSession } = await import('@/modules/auth/guards');
    const { canViewConversation } = await import('@/modules/inbox/access');

    vi.mocked(requireSession).mockResolvedValue(operator);
    vi.mocked(prisma.mediaAsset.findUnique).mockResolvedValue({
      id: 'asset-1',
      isComprobante: false,
      markedById: null,
      message: { conversationId: 'conv-1' },
    } as never);
    vi.mocked(canViewConversation).mockResolvedValue(false);
    vi.mocked(prisma.mediaAsset.update).mockResolvedValue(undefined as never);

    const { toggleArchivado } = await import('@/modules/comprobantes/actions');
    await toggleArchivado(makeFormData({ id: 'asset-1', isComprobante: 'true' }));

    // Should NOT call update because user can't view the conversation
    expect(prisma.mediaAsset.update).not.toHaveBeenCalled();
  });

  it('allows mark when operator can view the conversation', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { requireSession } = await import('@/modules/auth/guards');
    const { canViewConversation } = await import('@/modules/inbox/access');

    vi.mocked(requireSession).mockResolvedValue(operator);
    vi.mocked(prisma.mediaAsset.findUnique).mockResolvedValue({
      id: 'asset-1',
      isComprobante: false,
      markedById: null,
      message: { conversationId: 'conv-1' },
    } as never);
    vi.mocked(canViewConversation).mockResolvedValue(true);
    vi.mocked(prisma.mediaAsset.update).mockResolvedValue(undefined as never);

    const { toggleArchivado } = await import('@/modules/comprobantes/actions');
    await toggleArchivado(makeFormData({ id: 'asset-1', isComprobante: 'true' }));

    expect(prisma.mediaAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'asset-1' },
        data: expect.objectContaining({
          isComprobante: true,
          markedById: 'u1',
        }),
      }),
    );
  });

  it('allows admin to mark any file without conversation access check', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { requireSession } = await import('@/modules/auth/guards');
    const { canViewConversation } = await import('@/modules/inbox/access');

    vi.mocked(requireSession).mockResolvedValue(admin);
    vi.mocked(prisma.mediaAsset.findUnique).mockResolvedValue({
      id: 'asset-1',
      isComprobante: false,
      markedById: null,
      message: { conversationId: 'conv-1' },
    } as never);
    vi.mocked(prisma.mediaAsset.update).mockResolvedValue(undefined as never);

    const { toggleArchivado } = await import('@/modules/comprobantes/actions');
    await toggleArchivado(makeFormData({ id: 'asset-1', isComprobante: 'true' }));

    // Admin bypasses canViewConversation, should still update
    expect(canViewConversation).not.toHaveBeenCalled();
    expect(prisma.mediaAsset.update).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// toggleInboxComprobante tests — conversation access guard
// ---------------------------------------------------------------------------

describe('toggleInboxComprobante — inbox conversation access guard', () => {
  beforeEach(() => vi.clearAllMocks());

  function makeFormData(entries: Record<string, string>) {
    const fd = new FormData();
    for (const [key, value] of Object.entries(entries)) fd.set(key, value);
    return fd;
  }

  it('rejects mark when operator cannot view the conversation', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { requireSession } = await import('@/modules/auth/guards');
    const { canViewConversation } = await import('@/modules/inbox/access');

    vi.mocked(requireSession).mockResolvedValue(operator);
    vi.mocked(prisma.mediaAsset.findUnique).mockResolvedValue({
      id: 'asset-1',
      message: { conversationId: 'conv-1' },
    } as never);
    vi.mocked(canViewConversation).mockResolvedValue(false);
    vi.mocked(prisma.mediaAsset.update).mockResolvedValue(undefined as never);

    const { toggleInboxComprobante } = await import('@/modules/comprobantes/actions');
    await toggleInboxComprobante(makeFormData({ id: 'asset-1', isComprobante: 'true' }));

    expect(prisma.mediaAsset.update).not.toHaveBeenCalled();
  });

  it('allows mark when operator can view the conversation', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { requireSession } = await import('@/modules/auth/guards');
    const { canViewConversation } = await import('@/modules/inbox/access');

    vi.mocked(requireSession).mockResolvedValue(operator);
    vi.mocked(prisma.mediaAsset.findUnique).mockResolvedValue({
      id: 'asset-1',
      message: { conversationId: 'conv-1' },
    } as never);
    vi.mocked(canViewConversation).mockResolvedValue(true);
    vi.mocked(prisma.mediaAsset.update).mockResolvedValue(undefined as never);

    const { toggleInboxComprobante } = await import('@/modules/comprobantes/actions');
    await toggleInboxComprobante(makeFormData({ id: 'asset-1', isComprobante: 'true' }));

    expect(prisma.mediaAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'asset-1' },
        data: expect.objectContaining({
          isComprobante: true,
          markedById: 'u1',
        }),
      }),
    );
  });

  it('allows admin to mark without conversation access check', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { requireSession } = await import('@/modules/auth/guards');
    const { canViewConversation } = await import('@/modules/inbox/access');

    vi.mocked(requireSession).mockResolvedValue(admin);
    vi.mocked(prisma.mediaAsset.findUnique).mockResolvedValue({
      id: 'asset-1',
      message: { conversationId: 'conv-1' },
    } as never);
    vi.mocked(prisma.mediaAsset.update).mockResolvedValue(undefined as never);

    const { toggleInboxComprobante } = await import('@/modules/comprobantes/actions');
    await toggleInboxComprobante(makeFormData({ id: 'asset-1', isComprobante: 'true' }));

    expect(canViewConversation).not.toHaveBeenCalled();
    expect(prisma.mediaAsset.update).toHaveBeenCalled();
  });

  it('allows unmark without conversation access check (ownership was already established)', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { requireSession } = await import('@/modules/auth/guards');
    const { canViewConversation } = await import('@/modules/inbox/access');

    vi.mocked(requireSession).mockResolvedValue(operator);
    vi.mocked(prisma.mediaAsset.findUnique).mockResolvedValue({
      id: 'asset-1',
      message: { conversationId: 'conv-1' },
    } as never);
    vi.mocked(prisma.mediaAsset.update).mockResolvedValue(undefined as never);

    const { toggleInboxComprobante } = await import('@/modules/comprobantes/actions');
    await toggleInboxComprobante(makeFormData({ id: 'asset-1', isComprobante: 'false' }));

    // Unmark from inbox also checks conversation access
    expect(canViewConversation).toHaveBeenCalled();
    expect(prisma.mediaAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isComprobante: false,
          markedById: null,
          markedAt: null,
        }),
      }),
    );
  });
});
