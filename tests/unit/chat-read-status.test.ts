import { describe, expect, it } from 'vitest';

import {
  shouldMarkAsRead,
  computeUnreadBySender,
  mergeUnreadCounts,
} from '@/modules/chat/read-status';
import type { MessageReadState } from '@/modules/chat/read-status';

function msg(overrides: Partial<MessageReadState>): MessageReadState {
  return {
    userId: 'sender-1',
    recipientId: null,
    readAt: null,
    ...overrides,
  };
}

// ─── shouldMarkAsRead ────────────────────────────────────────────

describe('shouldMarkAsRead', () => {
  it('returns true for unread DM message sent TO current user', () => {
    const m = msg({ userId: 'alice', recipientId: 'bob', readAt: null });
    expect(shouldMarkAsRead(m, 'bob')).toBe(true);
  });

  it('returns false for already-read message', () => {
    const m = msg({ userId: 'alice', recipientId: 'bob', readAt: '2026-01-01T00:00:00.000Z' });
    expect(shouldMarkAsRead(m, 'bob')).toBe(false);
  });

  it('returns false for general chat message (recipientId null)', () => {
    const m = msg({ userId: 'alice', recipientId: null, readAt: null });
    expect(shouldMarkAsRead(m, 'bob')).toBe(false);
  });

  it('returns false for message sent TO someone else', () => {
    const m = msg({ userId: 'alice', recipientId: 'charlie', readAt: null });
    expect(shouldMarkAsRead(m, 'bob')).toBe(false);
  });

  it('returns false for message sent BY current user', () => {
    const m = msg({ userId: 'bob', recipientId: 'bob', readAt: null });
    expect(shouldMarkAsRead(m, 'bob')).toBe(false);
  });
});

// ─── computeUnreadBySender ───────────────────────────────────────

describe('computeUnreadBySender', () => {
  it('returns empty object when no unread messages exist', () => {
    const messages: MessageReadState[] = [];
    expect(computeUnreadBySender(messages, 'bob')).toEqual({});
  });

  it('counts unread messages sent TO current user grouped by sender', () => {
    const messages: MessageReadState[] = [
      msg({ userId: 'alice', recipientId: 'bob', readAt: null }),
      msg({ userId: 'alice', recipientId: 'bob', readAt: null }),
      msg({ userId: 'charlie', recipientId: 'bob', readAt: null }),
    ];
    expect(computeUnreadBySender(messages, 'bob')).toEqual({
      alice: 2,
      charlie: 1,
    });
  });

  it('ignores messages that have been read', () => {
    const messages: MessageReadState[] = [
      msg({ userId: 'alice', recipientId: 'bob', readAt: '2026-01-01T00:00:00.000Z' }),
      msg({ userId: 'alice', recipientId: 'bob', readAt: null }),
    ];
    expect(computeUnreadBySender(messages, 'bob')).toEqual({ alice: 1 });
  });

  it('ignores messages sent TO someone else', () => {
    const messages: MessageReadState[] = [
      msg({ userId: 'alice', recipientId: 'charlie', readAt: null }),
    ];
    expect(computeUnreadBySender(messages, 'bob')).toEqual({});
  });

  it('ignores general chat messages (recipientId null)', () => {
    const messages: MessageReadState[] = [
      msg({ userId: 'alice', recipientId: null, readAt: null }),
    ];
    expect(computeUnreadBySender(messages, 'bob')).toEqual({});
  });

  it('ignores own messages', () => {
    const messages: MessageReadState[] = [
      msg({ userId: 'bob', recipientId: 'bob', readAt: null }),
    ];
    expect(computeUnreadBySender(messages, 'bob')).toEqual({});
  });
});

// ─── mergeUnreadCounts ───────────────────────────────────────────

describe('mergeUnreadCounts', () => {
  type ChatUser = { id: string; name: string; online: boolean; departments: string[] };

  const users: ChatUser[] = [
    { id: 'alice', name: 'Alice', online: true, departments: ['Ventas'] },
    { id: 'bob', name: 'Bob', online: false, departments: [] },
    { id: 'charlie', name: 'Charlie', online: true, departments: ['Soporte'] },
  ];

  it('merges unread counts into user objects', () => {
    const unreadCounts = { alice: 2, charlie: 1 };
    const result = mergeUnreadCounts(users, unreadCounts);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ id: 'alice', name: 'Alice', online: true, departments: ['Ventas'], unreadCount: 2 });
    expect(result[1]).toEqual({ id: 'bob', name: 'Bob', online: false, departments: [], unreadCount: 0 });
    expect(result[2]).toEqual({ id: 'charlie', name: 'Charlie', online: true, departments: ['Soporte'], unreadCount: 1 });
  });

  it('defaults unreadCount to 0 for users with no unread messages', () => {
    const unreadCounts: Record<string, number> = {};
    const result = mergeUnreadCounts(users, unreadCounts);

    expect(result.every(u => u.unreadCount === 0)).toBe(true);
  });

  it('handles empty user list', () => {
    expect(mergeUnreadCounts([], { alice: 5 })).toEqual([]);
  });
});
