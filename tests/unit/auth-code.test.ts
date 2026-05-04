import { describe, expect, it } from 'vitest';

import { generateNumericCode, isSixDigitCode } from '@/modules/auth/codes';

describe('auth verification/reset codes', () => {
  it('generates six digit numeric codes with a cryptographically secure source', () => {
    const code = generateNumericCode();

    expect(code).toMatch(/^\d{6}$/);
    expect(Number(code)).toBeGreaterThanOrEqual(100000);
    expect(Number(code)).toBeLessThanOrEqual(999999);
  });

  it('validates only six digit code strings', () => {
    expect(isSixDigitCode('123456')).toBe(true);
    expect(isSixDigitCode('12345')).toBe(false);
    expect(isSixDigitCode('abcdef')).toBe(false);
    expect(isSixDigitCode('1234567')).toBe(false);
  });
});
