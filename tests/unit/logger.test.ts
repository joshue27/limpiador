import { describe, expect, it } from 'vitest';

import { createLogger, serializeError } from '@/lib/logger';

describe('logger', () => {
  it('writes structured JSON records through an injectable sink', () => {
    const records: string[] = [];
    const logger = createLogger({ sink: (line) => records.push(line) });

    logger.info('rate_limit_checked', {
      requestId: 'req-123',
      ip: '203.0.113.10',
      allowed: true,
    });

    expect(records).toHaveLength(1);
    expect(JSON.parse(records[0] ?? '{}')).toMatchObject({
      level: 'info',
      event: 'rate_limit_checked',
      requestId: 'req-123',
      ip: '203.0.113.10',
      allowed: true,
    });
  });

  it('redacts credentials, tokens, and email PII recursively', () => {
    const records: string[] = [];
    const logger = createLogger({ sink: (line) => records.push(line) });

    logger.warn('unsafe_context_received', {
      token: 'raw-token',
      nested: {
        password: 'secret-password',
        contactEmail: 'person@example.com',
      },
      message: 'email person@example.com used token raw-token',
    });

    const recordText = records[0] ?? '';
    const parsed = JSON.parse(recordText);

    expect(parsed.token).toBe('[REDACTED]');
    expect(parsed.nested.password).toBe('[REDACTED]');
    expect(parsed.nested.contactEmail).toBe('[REDACTED]');
    expect(recordText).not.toContain('person@example.com');
    expect(recordText).not.toContain('secret-password');
  });

  it('serializes errors without losing operational context', () => {
    const error = new Error('Redis unavailable');

    expect(serializeError(error)).toMatchObject({
      name: 'Error',
      message: 'Redis unavailable',
    });
    expect(serializeError('boom')).toEqual({ message: 'boom' });
  });
});
