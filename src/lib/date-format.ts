import { getConfig } from '@/lib/config';

/**
 * Returns the configured timezone (from env TIMEZONE, default America/Guatemala).
 */
export function getTimezone(): string {
  return getConfig().timezone;
}

/**
 * Format a date using the configured app timezone.
 * Equivalent to `date.toLocaleString('es-GT', { timeZone: getTimezone(), ...options })`.
 */
export function formatDateInTz(
  date: Date | string | number | null | undefined,
  options: Intl.DateTimeFormatOptions = {},
): string {
  if (date == null) return '';
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-GT', {
    timeZone: getTimezone(),
    timeZoneName: 'short',
    ...options,
  });
}

/**
 * Format a date as a short localised date+time string.
 */
export function formatDateTime(date: Date | string | number | null | undefined): string {
  return formatDateInTz(date, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a date as a full date+time string with seconds.
 */
export function formatDateTimeFull(date: Date | string | number | null | undefined): string {
  return formatDateInTz(date, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
