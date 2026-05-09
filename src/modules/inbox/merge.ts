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

  if (index === -1) {
    if (current.some((message) => message.id === serverMessage.id)) {
      return current;
    }

    const serverAttachmentNames = new Set(
      (serverMessage.mediaAssets ?? [])
        .map((asset) => asset.filename)
        .filter((filename): filename is string => Boolean(filename)),
    );

    const fallbackIndex = current.findIndex((message) => {
      if (!message.id.startsWith(CLIENT_ID_PREFIX)) return false;
      if (message.type !== serverMessage.type) return false;
      if (message.direction !== serverMessage.direction) return false;

      const messageAttachmentNames = new Set(
        (message.mediaAssets ?? [])
          .map((asset) => asset.filename)
          .filter((filename): filename is string => Boolean(filename)),
      );

      if (serverAttachmentNames.size > 0 && messageAttachmentNames.size > 0) {
        return [...serverAttachmentNames].every((filename) => messageAttachmentNames.has(filename));
      }

      return message.body === serverMessage.body && message.caption === serverMessage.caption;
    });

    if (fallbackIndex !== -1) {
      const result = [...current];
      result[fallbackIndex] = serverMessage;
      return result;
    }

    return [...current, serverMessage];
  }

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
