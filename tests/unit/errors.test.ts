import { describe, expect, it } from 'vitest';

import {
  AppError,
  classifyError,
  createOperationalError,
  isOperationalError,
} from '@/lib/errors';

describe('errors', () => {
  it('creates typed operational errors with safe context', () => {
    const error = createOperationalError('LIMITER_UNAVAILABLE', 'Redis unavailable', {
      statusCode: 503,
      context: { scope: 'login' },
      cause: new Error('ECONNREFUSED'),
    });

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('LIMITER_UNAVAILABLE');
    expect(error.statusCode).toBe(503);
    expect(error.isOperational).toBe(true);
    expect(error.context).toEqual({ scope: 'login' });
    expect(isOperationalError(error)).toBe(true);
  });

  it('classifies programmer errors as unsafe to recover by default', () => {
    const classified = classifyError(new TypeError('undefined is not a function'));

    expect(classified.isOperational).toBe(false);
    expect(classified.code).toBe('PROGRAMMER_ERROR');
    expect(classified.statusCode).toBe(500);
  });
});
