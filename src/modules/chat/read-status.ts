export interface MessageReadState {
  userId: string;
  recipientId: string | null;
  readAt: Date | string | null;
}

/**
 * Determines if a message should be marked as read by the current user.
 * Only unread DM messages sent TO the current user by someone else qualify.
 */
export function shouldMarkAsRead(
  message: MessageReadState,
  currentUserId: string,
): boolean {
  return (
    message.userId !== currentUserId &&
    message.recipientId !== null &&
    message.recipientId === currentUserId &&
    message.readAt === null
  );
}

/**
 * Computes unread message counts grouped by sender.
 * Takes an array of messages and returns a map of senderId → unreadCount
 * for unread DM messages received by currentUserId.
 */
export function computeUnreadBySender(
  messages: MessageReadState[],
  currentUserId: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const msg of messages) {
    if (
      msg.recipientId === currentUserId &&
      msg.readAt === null &&
      msg.userId !== currentUserId
    ) {
      counts[msg.userId] = (counts[msg.userId] || 0) + 1;
    }
  }
  return counts;
}

/**
 * Merges unread message counts into a user list.
 * Pure function — adds `unreadCount: 0` for users not in the counts map.
 */
export function mergeUnreadCounts<T extends { id: string }>(
  users: T[],
  unreadCounts: Record<string, number>,
): Array<T & { unreadCount: number }> {
  return users.map((user) => ({
    ...user,
    unreadCount: unreadCounts[user.id] ?? 0,
  }));
}
