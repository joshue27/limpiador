const conversationStatusLabels: Record<string, string> = {
  UNASSIGNED: 'Sin asignar',
  MENU_PENDING: 'Esperando menú',
  DEPARTMENT_QUEUE: 'En cola de equipo',
  CLAIMED: 'En atención',
};

export const conversationStatusOptions = Object.entries(conversationStatusLabels);

export type InboxFilters = {
  q: string;
  status: string;
  tag: string;
  assignedUser: string;
  department: string;
};

export function isValidConversationStatus(value: string | null | undefined) {
  return Boolean(value && conversationStatusLabels[value]);
}

export function parseInboxFilters(input: {
  q?: string | null;
  status?: string | null;
  tag?: string | null;
  assignedUser?: string | null;
  department?: string | null;
}) {
  return {
    q: input.q?.trim().slice(0, 80) ?? '',
    status: isValidConversationStatus(input.status) ? input.status ?? '' : '',
    tag: input.tag?.trim() ?? '',
    assignedUser: input.assignedUser?.trim() ?? '',
    department: input.department?.trim() ?? '',
  } satisfies InboxFilters;
}

export function inboxLink(conversationId: string, filters: Partial<InboxFilters>) {
  const params = new URLSearchParams();
  params.set('conversation', conversationId);

  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }

  return `/inbox?${params.toString()}`;
}
