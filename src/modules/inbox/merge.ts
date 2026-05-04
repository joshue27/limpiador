import type { QuotedMessageState } from '@/modules/inbox/message-history';

export const CLIENT_ID_PREFIX = 'client:';

/**
 * Generate a unique client-side identifier for optimistic messages.
 * Uses crypto.randomUUID() which works in browsers and Node.js 19+.
 * Format: client:{uuid}
 */
export function makeClientId(): string {
  return `${CLIENT_ID_PREFIX}${crypto.randomUUID()}`;
}

/**
 * Prepend an older page of messages to the current message list,
 * de-duplicating by message id. Keeps the first occurrence (the older
 * page's entry) when duplicates exist.
 */
export function prependOlderPage(
  current: QuotedMessageState[],
  olderPage: QuotedMessageState[],
): QuotedMessageState[] {
  const seen = new Set<string>();
  const result: QuotedMessageState[] = [];

  // Older page first (they get priority in de-dupe)
  for (const message of olderPage) {
    if (!seen.has(message.id)) {
      seen.add(message.id);
      result.push(message);
    }
  }

  // Then current messages (skip if already seen from older page)
  for (const message of current) {
    if (!seen.has(message.id)) {
      seen.add(message.id);
      result.push(message);
    }
  }

  return result;
}

/**
 * Replace an optimistic `client:*` row identified by `clientId`
 * with the authoritative server message. Returns a new array;
 * does not mutate the input.
 *
 * If no matching client row is found, the list is returned unchanged.
 */
export function reconcileOptimisticRow(
  current: QuotedMessageState[],
  clientId: string,
  serverMessage: QuotedMessageState,
): QuotedMessageState[] {
  const fullClientId = `${CLIENT_ID_PREFIX}${clientId}`;
  const index = current.findIndex((m) => m.id === fullClientId);

  if (index === -1) return current;

  const result = [...current];
  result[index] = serverMessage;
  return result;
}

/**
 * Merge refreshed persisted messages into the current list.
 * - Updates existing persisted messages by id (replaces in place).
 * - Appends new messages not already present.
 * - Never deletes unresolved `client:*` rows.
 *
 * Returns a new array; does not mutate inputs.
 */
export function mergeRefreshedMessages(
  current: QuotedMessageState[],
  refreshed: QuotedMessageState[],
): QuotedMessageState[] {
  const idIndex = new Map<string, number>();
  for (let i = 0; i < current.length; i++) {
    idIndex.set(current[i].id, i);
  }

  const result = [...current];

  for (const fresh of refreshed) {
    const existingIdx = idIndex.get(fresh.id);

    if (existingIdx !== undefined) {
      // Update existing persisted row in place
      result[existingIdx] = fresh;
    } else {
      // New message — append
      result.push(fresh);
    }
  }

  return result;
}
