import { describe, expect, it } from 'vitest';

import { sha256 } from '@/shared/crypto';
import {
  hashPassword,
  hashPasswordSha256,
  verifyPasswordDual,
  type PasswordVerifyResult,
} from '@/modules/auth/password';

// ---------------------------------------------------------------------------
// sha256
// ---------------------------------------------------------------------------
describe('sha256', () => {
  it('produces a 64-character hex string', async () => {
    const result = await sha256('hello');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic — same input produces same output', async () => {
    const a = await sha256('password123');
    const b = await sha256('password123');
    expect(a).toBe(b);
  });

  it('produces different output for different inputs', async () => {
    const a = await sha256('password123');
    const b = await sha256('different');
    expect(a).not.toBe(b);
  });

  it('matches known SHA-256 test vector (empty string)', async () => {
    const result = await sha256('');
    expect(result).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});

// ---------------------------------------------------------------------------
// hashPasswordSha256
// ---------------------------------------------------------------------------
describe('hashPasswordSha256', () => {
  it('produces a valid bcrypt hash from a SHA-256 hex string', async () => {
    const sha256Hex = await sha256('my-secret-password');
    const bcryptHash = await hashPasswordSha256(sha256Hex);

    // bcrypt hashes start with $2a$ or $2b$ and are ~60 chars
    expect(bcryptHash).toMatch(/^\$2[ab]\$\d{2}\$/);
    expect(bcryptHash.length).toBeGreaterThanOrEqual(59);
  });
});

// ---------------------------------------------------------------------------
// verifyPasswordDual — new user path
// ---------------------------------------------------------------------------
describe('verifyPasswordDual — new user (bcrypt of SHA-256)', () => {
  it('verifies correctly when hash matches the stored bcrypt(sha256)', async () => {
    const rawPassword = 'secret123';
    const hash = await sha256(rawPassword);
    const storedHash = await hashPasswordSha256(hash);

    const result: PasswordVerifyResult = await verifyPasswordDual(
      hash,
      rawPassword,
      storedHash,
    );
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.upgraded).toBe(false);
    }
  });

  it('rejects wrong SHA-256 hash', async () => {
    const storedHash = await hashPasswordSha256(await sha256('correct'));
    const wrongHash = await sha256('wrong');

    const result = await verifyPasswordDual(wrongHash, 'wrong', storedHash);
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// verifyPasswordDual — old user fallback
// ---------------------------------------------------------------------------
describe('verifyPasswordDual — old user fallback (bcrypt of plaintext)', () => {
  it('falls back to raw password for old users and signals upgrade needed', async () => {
    const rawPassword = 'old-legacy-password';
    // Old-style stored hash: bcrypt(plaintext)
    const storedHash = await hashPassword(rawPassword);
    const hash = await sha256(rawPassword);

    const result = await verifyPasswordDual(hash, rawPassword, storedHash);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.upgraded).toBe(true);
    }
  });

  it('rejects when both hash and raw password are wrong', async () => {
    const rawPassword = 'actual-password';
    const storedHash = await hashPassword(rawPassword);
    const wrongHash = await sha256('not-the-password');

    const result = await verifyPasswordDual(wrongHash, 'also-wrong', storedHash);
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// verifyPasswordDual — upgrade path end-to-end simulation
// ---------------------------------------------------------------------------
describe('verifyPasswordDual — upgrade path', () => {
  it('after upgrade, old path no longer works and new path works', async () => {
    const rawPassword = 'migrate-me-123';
    // 1. Old hash (bcrypt of plaintext)
    const oldHash = await hashPassword(rawPassword);
    const sha256Hash = await sha256(rawPassword);

    // 2. First login: falls back to raw password, flags upgrade
    const firstResult = await verifyPasswordDual(sha256Hash, rawPassword, oldHash);
    expect(firstResult.valid).toBe(true);
    if (firstResult.valid) {
      expect(firstResult.upgraded).toBe(true);
    }

    // 3. Simulate upgrade: store bcrypt(sha256Hash)
    const newHash = await hashPasswordSha256(sha256Hash);

    // 4. Next login: verifies via new path
    const secondResult = await verifyPasswordDual(sha256Hash, rawPassword, newHash);
    expect(secondResult.valid).toBe(true);
    if (secondResult.valid) {
      expect(secondResult.upgraded).toBe(false);
    }
  });

  it('upgraded hash does NOT accept raw password alone (without hash)', async () => {
    const rawPassword = 'post-upgrade-pass';
    const hash = await sha256(rawPassword);
    const newHash = await hashPasswordSha256(hash);

    // Try to verify with rawPassword only (simulating someone sending raw password as "hash")
    const result = await verifyPasswordDual(rawPassword, rawPassword, newHash);
    // bcrypt(sha256(rawPassword)) != bcrypt(rawPassword)
    // Fallback: bcrypt.compare(rawPassword, newHash) should fail since newHash = bcrypt(sha256(rawPassword))
    expect(result.valid).toBe(false);
  });
});
