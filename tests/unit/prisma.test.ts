import { describe, expect, it, vi } from 'vitest';

const disconnect = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => ({ $disconnect: disconnect })),
}));

describe('prisma lifecycle seam', () => {
  it('exports a disconnect helper for lifecycle cleanup', async () => {
    const { disconnectPrisma } = await import('@/lib/prisma');

    await disconnectPrisma();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
