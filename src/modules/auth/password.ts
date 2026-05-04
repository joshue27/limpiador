import bcrypt from 'bcryptjs';

const PASSWORD_COST = 12;

// ---------------------------------------------------------------------------
// Legacy — kept for backward compatibility
// ---------------------------------------------------------------------------

/** Hash a plaintext password with bcrypt. Used for old-style storage. */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_COST);
}

/** Verify a plaintext password against a bcrypt hash (legacy). */
export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

// ---------------------------------------------------------------------------
// New — SHA-256 pre-hashing
// ---------------------------------------------------------------------------

/**
 * Hash a SHA-256 hex digest with bcrypt.
 *
 * The client sends `sha256(rawPassword)` over the wire, so the server
 * never sees the plaintext password. This function produces the stored
 * bcrypt hash from that SHA-256 digest.
 */
export function hashPasswordSha256(sha256Hex: string): Promise<string> {
  return bcrypt.hash(sha256Hex, PASSWORD_COST);
}

/**
 * Result of dual-path password verification.
 *
 * - `valid: true, upgraded: false` → SHA-256 hash matched new-style bcrypt.
 * - `valid: true, upgraded: true`  → raw password matched old-style bcrypt
 *   (fallback); caller SHOULD upgrade the stored hash.
 * - `valid: false`                 → neither path matched.
 */
export type PasswordVerifyResult =
  | { valid: true; upgraded: boolean }
  | { valid: false };

/**
 * Verify a password using dual-path strategy:
 *
 * 1. Try `bcrypt.compare(hash, storedHash)`  — new users (bcrypt(sha256)).
 * 2. If that fails, try `bcrypt.compare(rawPassword, storedHash)` — old
 *    users (bcrypt(plaintext)).
 *
 * When step 2 succeeds, `upgraded: true` is returned so the caller can
 * replace the stored hash with `bcrypt(sha256)`.
 */
export async function verifyPasswordDual(
  hash: string,
  rawPassword: string,
  storedHash: string,
): Promise<PasswordVerifyResult> {
  const hashMatch = await bcrypt.compare(hash, storedHash);
  if (hashMatch) {
    return { valid: true, upgraded: false };
  }

  if (!rawPassword) {
    return { valid: false };
  }

  const rawMatch = await bcrypt.compare(rawPassword, storedHash);
  if (rawMatch) {
    return { valid: true, upgraded: true };
  }

  return { valid: false };
}
