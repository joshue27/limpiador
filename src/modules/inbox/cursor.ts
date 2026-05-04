export type InboxCursor = {
  createdAt: string;
  id: string;
};

function isValidDate(str: string): boolean {
  const d = new Date(str);
  return d instanceof Date && !Number.isNaN(d.getTime());
}

/**
 * Encode a cursor for older-page pagination as URL-safe base64 JSON.
 * The cursor object contains { createdAt: ISO string, id: message id }.
 */
export function encodeInboxCursor(createdAt: Date | string, id: string): string {
  const createdAtStr = typeof createdAt === 'string' ? createdAt : createdAt.toISOString();
  const json = JSON.stringify({ createdAt: createdAtStr, id });
  return Buffer.from(json).toString('base64url');
}

/**
 * Decode an older-page cursor. Returns null if the cursor is malformed,
 * missing required fields, or contains an invalid date.
 */
export function decodeInboxCursor(cursor: string): InboxCursor | null {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.createdAt !== 'string' || typeof obj.id !== 'string') return null;
    if (!isValidDate(obj.createdAt) || !obj.id) return null;
    return { createdAt: obj.createdAt, id: obj.id };
  } catch {
    return null;
  }
}

/**
 * Build a Prisma where clause for older-page messages.
 * Uses the stable (createdAt, id) cursor approach:
 *   createdAt < cursor.createdAt OR (createdAt = cursor.createdAt AND id < cursor.id)
 *
 * When cursor is null, the base where is returned unchanged (newest messages).
 */
export function buildCursorWhere<T extends Record<string, unknown>>(
  baseWhere: T,
  cursor: InboxCursor | null,
): T & { OR?: Array<Record<string, unknown>> } {
  if (!cursor) return baseWhere;

  const createdAtDate = new Date(cursor.createdAt);

  return {
    ...baseWhere,
    OR: [
      { createdAt: { lt: createdAtDate } },
      { createdAt: createdAtDate, id: { lt: cursor.id } },
    ],
  };
}

const INBOX_MESSAGES_DEFAULT_LIMIT = 20;
const INBOX_MESSAGES_MAX_LIMIT = 50;

/**
 * Validate and clamp a limit value for inbox message queries.
 * Returns the clamped limit (1-50), defaulting to 20 for NaN/edge cases.
 */
export function validateInboxMessagesLimit(limit: number): number {
  if (Number.isNaN(limit)) return INBOX_MESSAGES_DEFAULT_LIMIT;
  return Math.max(1, Math.min(INBOX_MESSAGES_MAX_LIMIT, Math.floor(limit)));
}
