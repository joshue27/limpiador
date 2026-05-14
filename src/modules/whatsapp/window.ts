export const whatsappWindowMs = 24 * 60 * 60 * 1000;

export type WindowOpenedBy = 'INBOUND' | 'TEMPLATE';

export function getWindowOpenedAt(input: {
  lastWindowOpenedAt?: Date | null;
  lastInboundAt?: Date | null;
}) {
  return input.lastWindowOpenedAt ?? input.lastInboundAt ?? null;
}

export function getWindowOpenedBy(input: {
  lastWindowOpenedBy?: string | null;
  lastInboundAt?: Date | null;
}): WindowOpenedBy | null {
  if (input.lastWindowOpenedBy === 'INBOUND' || input.lastWindowOpenedBy === 'TEMPLATE') {
    return input.lastWindowOpenedBy;
  }

  return input.lastInboundAt ? 'INBOUND' : null;
}

export function isWindowActive(openedAt: Date | null, now = new Date()) {
  return Boolean(openedAt && openedAt.getTime() + whatsappWindowMs > now.getTime());
}

export function resolveWindowState(
  previousOpenedAt: Date | null,
  previousOpenedBy: WindowOpenedBy | null,
  triggerAt: Date,
  triggerBy: WindowOpenedBy,
) {
  if (isWindowActive(previousOpenedAt, triggerAt) && previousOpenedAt) {
    return {
      openedAt: previousOpenedAt,
      openedBy: previousOpenedBy ?? triggerBy,
    };
  }

  return {
    openedAt: triggerAt,
    openedBy: triggerBy,
  };
}
