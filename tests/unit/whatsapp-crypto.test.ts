import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  encryptWhatsappSecret,
  decryptWhatsappSecret,
  isEncrypted,
} from '@/modules/settings/whatsapp-crypto';

const previousWhatsappSettingsKey = process.env.WHATSAPP_SETTINGS_KEY;

beforeEach(() => {
  process.env.WHATSAPP_SETTINGS_KEY = 'unit-test-whatsapp-settings-key';
});

afterEach(() => {
  if (previousWhatsappSettingsKey === undefined) {
    delete process.env.WHATSAPP_SETTINGS_KEY;
    return;
  }
  process.env.WHATSAPP_SETTINGS_KEY = previousWhatsappSettingsKey;
});

describe('encryptWhatsappSecret / decryptWhatsappSecret', () => {
  it('roundtrip: encrypt then decrypt returns original plaintext', () => {
    const plaintext = 'my-secret-token-12345';
    const encrypted = encryptWhatsappSecret(plaintext);
    const decrypted = decryptWhatsappSecret(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('roundtrip with special characters and long strings', () => {
    const plaintext = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`\n\t  Unicode: ñáéíóú 日本語';
    const encrypted = encryptWhatsappSecret(plaintext);
    const decrypted = decryptWhatsappSecret(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('encrypting the same plaintext twice produces different ciphertexts (different IVs)', () => {
    const plaintext = 'determinism-check';
    const encrypted1 = encryptWhatsappSecret(plaintext);
    const encrypted2 = encryptWhatsappSecret(plaintext);
    expect(encrypted1).not.toBe(encrypted2);
    // Both should decrypt back to the original
    expect(decryptWhatsappSecret(encrypted1)).toBe(plaintext);
    expect(decryptWhatsappSecret(encrypted2)).toBe(plaintext);
  });

  it('encrypted output contains three hex parts separated by colons', () => {
    const encrypted = encryptWhatsappSecret('test-value');
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);
    // Each part should be valid hex
    for (const part of parts) {
      expect(part).toMatch(/^[0-9a-f]+$/i);
      expect(part.length).toBeGreaterThan(0);
    }
  });

  it('decrypt throws on tampered ciphertext', () => {
    const encrypted = encryptWhatsappSecret('original');
    // Tamper with the ciphertext part (second segment)
    const parts = encrypted.split(':');
    parts[1] = 'ff' + parts[1].slice(2); // Modify ciphertext
    const tampered = parts.join(':');
    expect(() => decryptWhatsappSecret(tampered)).toThrow();
  });

  it('decrypt throws on completely invalid format', () => {
    expect(() => decryptWhatsappSecret('not-encrypted')).toThrow();
    expect(() => decryptWhatsappSecret('')).toThrow();
    expect(() => decryptWhatsappSecret('a:b')).toThrow();
    expect(() => decryptWhatsappSecret('a:b:c:d:e')).toThrow();
  });

  it('decrypts values encrypted with the legacy fallback key for backward compatibility', async () => {
    process.env.WHATSAPP_SETTINGS_KEY = 'limpiador-whatsapp-settings-default-key-2024';
    const legacyEncrypted = encryptWhatsappSecret('legacy-secret');

    process.env.WHATSAPP_SETTINGS_KEY = 'unit-test-whatsapp-settings-key';
    expect(decryptWhatsappSecret(legacyEncrypted)).toBe('legacy-secret');
  });
});

describe('isEncrypted', () => {
  it('returns true for freshly encrypted values', () => {
    const encrypted = encryptWhatsappSecret('some-secret');
    expect(isEncrypted(encrypted)).toBe(true);
  });

  it('returns false for plaintext strings', () => {
    expect(isEncrypted('plain-text-value')).toBe(false);
    expect(isEncrypted('test-access-token')).toBe(false);
    expect(isEncrypted('')).toBe(false);
  });

  it('returns false for values that look like env var values but are not encrypted', () => {
    expect(isEncrypted('v21.0')).toBe(false);
    expect(isEncrypted('test-waba-id')).toBe(false);
    expect(isEncrypted('12345')).toBe(false);
  });

  it('returns true for properly formatted hex colon-separated triples', () => {
    // Construct a valid-looking encrypted string manually
    const validHexTriple = 'abcdef1234567890:fedcba0987654321:deadbeefcafe1234';
    expect(isEncrypted(validHexTriple)).toBe(true);
  });

  it('returns false for colon-separated strings with non-hex parts', () => {
    expect(isEncrypted('abc:def:ghi')).toBe(false);
    expect(isEncrypted('abc123:def456:zxy789')).toBe(false);
  });
});
