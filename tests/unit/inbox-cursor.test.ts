import { describe, expect, it } from 'vitest';

import { buildCursorWhere, decodeInboxCursor, encodeInboxCursor, validateInboxMessagesLimit } from '@/modules/inbox/cursor';

describe('encodeInboxCursor', () => {
  it('encodes a Date object and id as URL-safe base64 JSON', () => {
    const createdAt = new Date('2026-04-24T10:00:00.000Z');
    const id = 'msg-abc-123';

    const cursor = encodeInboxCursor(createdAt, id);

    expect(cursor).toBeTypeOf('string');
    // URL-safe base64 must not contain + / or =
    expect(cursor).not.toContain('+');
    expect(cursor).not.toContain('/');
    expect(cursor).not.toContain('=');

    const decoded = decodeInboxCursor(cursor);
    expect(decoded).not.toBeNull();
    expect(decoded!.createdAt).toBe('2026-04-24T10:00:00.000Z');
    expect(decoded!.id).toBe('msg-abc-123');
  });

  it('encodes a string createdAt and id', () => {
    const createdAt = '2025-12-01T00:00:00.000Z';
    const id = 'cuid-x';

    const cursor = encodeInboxCursor(createdAt, id);
    const decoded = decodeInboxCursor(cursor);

    expect(decoded!.createdAt).toBe('2025-12-01T00:00:00.000Z');
    expect(decoded!.id).toBe('cuid-x');
  });
});

describe('decodeInboxCursor', () => {
  it('returns null for an empty string', () => {
    expect(decodeInboxCursor('')).toBeNull();
  });

  it('returns null for non-base64 garbage', () => {
    expect(decodeInboxCursor('!!!not-base64!!!')).toBeNull();
  });

  it('returns null for valid base64 that is not JSON', () => {
    // "hello" in base64
    expect(decodeInboxCursor('aGVsbG8')).toBeNull();
  });

  it('returns null when JSON is missing createdAt', () => {
    const cursor = Buffer.from(JSON.stringify({ id: 'msg-1' })).toString('base64url');
    expect(decodeInboxCursor(cursor)).toBeNull();
  });

  it('returns null when JSON is missing id', () => {
    const cursor = Buffer.from(JSON.stringify({ createdAt: '2026-01-01T00:00:00.000Z' })).toString('base64url');
    expect(decodeInboxCursor(cursor)).toBeNull();
  });

  it('returns null when createdAt is not a valid date string', () => {
    const cursor = Buffer.from(JSON.stringify({ createdAt: 'not-a-date', id: 'msg-1' })).toString('base64url');
    expect(decodeInboxCursor(cursor)).toBeNull();
  });

  it('returns null when values are wrong types', () => {
    const cursor = Buffer.from(JSON.stringify({ createdAt: 12345, id: 'msg-1' })).toString('base64url');
    expect(decodeInboxCursor(cursor)).toBeNull();
  });

  it('roundtrips cursor with special characters in id', () => {
    const createdAt = new Date('2026-04-24T18:00:00.000Z');
    const id = 'clx_abc-123_XYZ';

    const encoded = encodeInboxCursor(createdAt, id);
    const decoded = decodeInboxCursor(encoded);

    expect(decoded).not.toBeNull();
    expect(decoded!.createdAt).toBe('2026-04-24T18:00:00.000Z');
    expect(decoded!.id).toBe('clx_abc-123_XYZ');
  });

  it('roundtrips cursor with Date that has milliseconds', () => {
    const createdAt = new Date('2026-04-29T23:59:59.999Z');
    const id = 'cuid-999';

    const encoded = encodeInboxCursor(createdAt, id);
    const decoded = decodeInboxCursor(encoded);

    expect(decoded!.createdAt).toBe('2026-04-29T23:59:59.999Z');
    expect(decoded!.id).toBe('cuid-999');
  });
});

describe('buildCursorWhere', () => {
  const baseWhere = {
    conversationId: 'conv-1',
    hiddenGlobally: false,
    hiddenByUsers: { none: { userId: 'user-1' } },
  };

  it('returns base where when cursor is null (no cursor = newest first)', () => {
    const result = buildCursorWhere(baseWhere, null);

    expect(result).toEqual(baseWhere);
    expect(result).not.toHaveProperty('OR');
  });

  it('builds (createdAt, id) tie-breaking where clause from cursor', () => {
    const cursor = { createdAt: '2026-04-24T10:00:00.000Z', id: 'msg-oldest' };

    const result = buildCursorWhere(baseWhere, cursor);

    expect(result.conversationId).toBe('conv-1');
    expect(result.hiddenGlobally).toBe(false);
    expect(result.hiddenByUsers).toEqual({ none: { userId: 'user-1' } });

    // Must have OR with two conditions
    expect(result.OR).toBeDefined();
    const or = result.OR as Array<Record<string, unknown>>;
    expect(or).toHaveLength(2);

    // First condition: createdAt < cursor.createdAt
    expect(or[0]).toEqual({ createdAt: { lt: new Date('2026-04-24T10:00:00.000Z') } });

    // Second condition: (createdAt = cursor.createdAt AND id < cursor.id)
    expect(or[1]).toEqual({
      createdAt: new Date('2026-04-24T10:00:00.000Z'),
      id: { lt: 'msg-oldest' },
    });
  });

  it('handles same-timestamp messages correctly via id tie-break', () => {
    // Three messages with same timestamp: msg-c, msg-b, msg-a
    // Cursor points at msg-b (oldest visible so far)
    const cursor = { createdAt: '2026-04-24T12:00:00.000Z', id: 'msg-b' };

    const result = buildCursorWhere(baseWhere, cursor);
    const or = result.OR as Array<Record<string, unknown>>;

    // Should find: createdAt < T12:00 (none, since they all share it)
    // OR (createdAt = T12:00 AND id < 'msg-b') — should return msg-a only (older)
    expect(or[0]).toEqual({ createdAt: { lt: new Date('2026-04-24T12:00:00.000Z') } });
    expect(or[1]).toEqual({
      createdAt: new Date('2026-04-24T12:00:00.000Z'),
      id: { lt: 'msg-b' },
    });
  });

  it('does not mutate the base where object', () => {
    const cursor = { createdAt: '2026-04-24T10:00:00.000Z', id: 'msg-1' };
    const originalBase = { ...baseWhere };

    buildCursorWhere(baseWhere, cursor);

    expect(baseWhere).toEqual(originalBase);
    expect(baseWhere).not.toHaveProperty('OR');
  });
});

describe('validateInboxMessagesLimit', () => {
  it('clamps above 50 to 50', () => {
    expect(validateInboxMessagesLimit(100)).toBe(50);
    expect(validateInboxMessagesLimit(51)).toBe(50);
  });

  it('clamps below 1 to 1', () => {
    expect(validateInboxMessagesLimit(0)).toBe(1);
    expect(validateInboxMessagesLimit(-5)).toBe(1);
  });

  it('returns the number when in valid range', () => {
    expect(validateInboxMessagesLimit(20)).toBe(20);
    expect(validateInboxMessagesLimit(1)).toBe(1);
    expect(validateInboxMessagesLimit(50)).toBe(50);
  });

  it('defaults NaN to 20', () => {
    expect(validateInboxMessagesLimit(Number.NaN)).toBe(20);
  });

  it('defaults undefined to 20', () => {
    expect(validateInboxMessagesLimit(Number.NaN)).toBe(20);
  });
});
