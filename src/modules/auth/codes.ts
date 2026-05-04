import { randomInt } from 'node:crypto';

const MIN_CODE = 100000;
const MAX_CODE_EXCLUSIVE = 1000000;

export function generateNumericCode(): string {
  return String(randomInt(MIN_CODE, MAX_CODE_EXCLUSIVE));
}

export function isSixDigitCode(value: string): boolean {
  return /^\d{6}$/.test(value);
}
