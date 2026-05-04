import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
  serializeError: (error: unknown) => ({ message: error instanceof Error ? error.message : String(error) }),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    conversation: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('@/modules/audit/actions', () => ({
  AUDIT_ACTIONS: { INBOX_CONVERSATION_DELETED: 'INBOX_CONVERSATION_DELETED' },
}));

vi.mock('@/modules/audit/audit', () => ({
  writeAuditLog: vi.fn(async () => undefined),
}));

vi.mock('@/modules/auth/guards', () => ({
  requireSession: vi.fn(async () => ({ userId: 'user-123' })),
  requireRole: vi.fn(async () => undefined),
}));

vi.mock('@/modules/inbox/access', () => ({
  canViewConversation: vi.fn(async () => true),
}));

describe('inbox delete logging', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  beforeEach(() => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      contact: { id: 'contact-123', waId: '5491100000000', displayName: 'Ada', phone: '+5491100000000' },
      messages: [{ id: 'message-1' }, { id: 'message-2' }],
    } as never);
    vi.mocked(prisma.conversation.delete).mockRejectedValue(new Error('database unavailable'));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('logs delete failures with structured context instead of raw console diagnostics', async () => {
    const { POST } = await import('@/app/api/inbox/[id]/delete/route');
    const request = new Request('https://example.test/inbox/conversation-123/delete', {
      method: 'POST',
      body: new URLSearchParams({ confirmation: 'ELIMINAR' }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'conversation-123' }) });

    expect(response.status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith('conversation_delete_failed', {
      err: expect.objectContaining({ message: 'database unavailable' }),
      conversationId: 'conversation-123',
      userId: 'user-123',
      messageCount: 2,
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('omits contact PII from conversation delete failure logs', async () => {
    const { POST } = await import('@/app/api/inbox/[id]/delete/route');
    const request = new Request('https://example.test/inbox/conversation-123/delete', {
      method: 'POST',
      body: new URLSearchParams({ confirmation: 'ELIMINAR' }),
    });

    await POST(request, { params: Promise.resolve({ id: 'conversation-123' }) });

    const [, context] = vi.mocked(logger.error).mock.calls[0] ?? [];
    expect(context).toEqual({
      err: { message: 'database unavailable' },
      conversationId: 'conversation-123',
      userId: 'user-123',
      messageCount: 2,
    });
    expect(JSON.stringify(context)).not.toContain('+5491100000000');
    expect(JSON.stringify(context)).not.toContain('5491100000000');
  });
});
