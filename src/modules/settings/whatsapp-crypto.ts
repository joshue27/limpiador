import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits, recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const LEGACY_DEFAULT_KEY = 'limpiador-whatsapp-settings-default-key-2024';

function deriveKey(raw: string): Buffer {
  return createHash('sha256').update(raw).digest();
}

function getConfiguredKey(): string {
  const raw = process.env.WHATSAPP_SETTINGS_KEY?.trim();
  if (!raw) {
    throw new Error('WHATSAPP_SETTINGS_KEY is required to encrypt/decrypt WhatsApp secrets');
  }
  return raw;
}

export function encryptWhatsappSecret(plaintext: string): string {
  const key = deriveKey(getConfiguredKey());
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
}

export function decryptWhatsappSecret(encrypted: string): string {
  if (!isEncrypted(encrypted)) {
    throw new Error('Value is not in encrypted format');
  }

  const configuredKey = getConfiguredKey();
  const [ivHex, ciphertextHex, authTagHex] = encrypted.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const candidateKeys = [configuredKey];
  if (configuredKey !== LEGACY_DEFAULT_KEY) {
    candidateKeys.push(LEGACY_DEFAULT_KEY);
  }

  for (const candidate of candidateKeys) {
    try {
      const decipher = createDecipheriv(ALGORITHM, deriveKey(candidate), iv, { authTagLength: AUTH_TAG_LENGTH });
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return decrypted.toString('utf8');
    } catch {
      // Try next candidate key.
    }
  }

  throw new Error('Unsupported state or unable to authenticate data');
}

export function isEncrypted(value: string): boolean {
  if (!value || typeof value !== 'string') return false;

  const parts = value.split(':');
  if (parts.length !== 3) return false;

  // Each part must be non-empty hex
  const hexRegex = /^[0-9a-f]+$/i;
  return parts.every((part) => part.length > 0 && hexRegex.test(part));
}
