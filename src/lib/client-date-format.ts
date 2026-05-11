'use client';

const DEFAULT_TZ = 'America/Guatemala';

/** Global injected by the server layout. */
declare const window: Window & { __TIMEZONE__?: string };

/**
 * Get the app timezone on the client side.
 * Falls back to `window.__TIMEZONE__` set by the server layout.
 */
export function getClientTimezone(): string {
  if (typeof window !== 'undefined' && window.__TIMEZONE__) {
    return window.__TIMEZONE__;
  }
  return DEFAULT_TZ;
}

/**
 * Format a date using the configured app timezone (client-side).
 */
export function formatDateClient(
  date: Date | string | number | null | undefined,
  options: Intl.DateTimeFormatOptions = {},
): string {
  if (date == null) return '';
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-GT', {
    timeZone: getClientTimezone(),
    timeZoneName: 'short',
    ...options,
  });
}

/**
 * Short date+time string (client-side).
 */
export function formatDateTimeClient(date: Date | string | number | null | undefined): string {
  return formatDateClient(date, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
