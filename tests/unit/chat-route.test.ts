import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getVerifiedSession: vi.fn(),
  prisma: {
    user: {
      updateMany: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    internalMessage: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      groupBy: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('@/modules/auth/guards', () => ({ getVerifiedSession: mocks.getVerifiedSession }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));

describe('chat route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVerifiedSession.mockResolvedValue({ userId: 'user-1' });
    mocks.prisma.user.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.user.update.mockResolvedValue(undefined);
    mocks.prisma.user.findMany
      .mockResolvedValueOnce([{ id: 'user-2' }])
      .mockResolvedValueOnce([
        {
          id: 'user-2',
          name: 'Bob',
          email: 'bob@example.com',
          lastLoginAt: new Date('2026-05-02T10:00:00.000Z'),
          departments: [{ department: { name: 'Ventas' } }],
        },
      ]);
    mocks.prisma.internalMessage.findMany.mockResolvedValue([
      {
        id: 'message-1',
        body: 'Hola',
        createdAt: new Date('2026-05-02T10:00:00.000Z'),
        userId: 'user-2',
        recipientId: 'user-1',
        user: { id: 'user-2', name: 'Bob', email: 'bob@example.com' },
      },
    ]);
    mocks.prisma.internalMessage.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.internalMessage.groupBy.mockResolvedValue([{ userId: 'user-2', _count: { id: 2 } }]);
    mocks.prisma.internalMessage.count.mockResolvedValue(3);
    mocks.prisma.internalMessage.create.mockResolvedValue({ id: 'message-2' });
  });

  it('throttles heartbeat writes on GET while preserving unread metadata', async () => {
    const { GET } = await import('@/app/api/chat/route');

    const response = await GET(new Request('http://localhost/api/chat?with=user-2'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
        OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: expect.any(Date) } }],
      },
      data: { lastLoginAt: expect.any(Date) },
    });
    expect(mocks.prisma.internalMessage.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-2',
        recipientId: 'user-1',
        readAt: null,
      },
      data: { readAt: expect.any(Date) },
    });
    expect(payload.users).toEqual([
      {
        id: 'user-2',
        name: 'Bob',
        online: true,
        departments: ['Ventas'],
        unreadCount: 2,
      },
    ]);
    expect(payload.generalUnread).toBe(3);
  });
});
