import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

import { loadConfig } from '@/lib/config';
import { encryptWhatsappSecret } from '@/modules/settings/whatsapp-crypto';

const previousWhatsappSettingsKey = process.env.WHATSAPP_SETTINGS_KEY;

beforeEach(() => {
  process.env.WHATSAPP_SETTINGS_KEY = 'unit-test-whatsapp-settings-key';
});

afterEach(() => {
  vi.restoreAllMocks();
  if (previousWhatsappSettingsKey === undefined) {
    delete process.env.WHATSAPP_SETTINGS_KEY;
    return;
  }
  process.env.WHATSAPP_SETTINGS_KEY = previousWhatsappSettingsKey;
});

// Mock readFileSync so we control whether whatsapp.json exists
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, readFileSync: vi.fn(() => { throw new Error('ENOENT'); }) };
});

const baseEnv = {
  NODE_ENV: 'test' as const,
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://localhost/test',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_SECRET: 'test-session-secret-with-at-least-32-chars-!!',
  WHATSAPP_GRAPH_API_VERSION: 'v21.0',
  WHATSAPP_PHONE_NUMBER_ID: 'test-phone-number-id',
  WHATSAPP_BUSINESS_ACCOUNT_ID: 'test-waba-id',
  WHATSAPP_ACCESS_TOKEN: 'test-access-token',
  WHATSAPP_APP_SECRET: 'test-app-secret',
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'test-verify-token',
  PRIVATE_MEDIA_ROOT: './tmpx/test-media',
  PRIVATE_EXPORT_ROOT: './tmpx/test-exports',
};

describe('loadConfig', () => {
  it('loads server-only app configuration from environment variables', () => {
    const config = loadConfig(baseEnv);

    expect(config.session.secret.length).toBeGreaterThanOrEqual(32);
    expect(config.whatsapp.accessToken).toBe('test-access-token');
  });

  it('includes webhookUrl derived from APP_URL', () => {
    const config = loadConfig(baseEnv);
    expect(config.whatsapp.webhookUrl).toBe('http://localhost:3000/api/webhooks/whatsapp');
  });

  it('uses env values when whatsapp.json does NOT exist', () => {
    vi.mocked(readFileSync).mockImplementationOnce(() => { throw new Error('ENOENT'); });

    const config = loadConfig(baseEnv);

    expect(config.whatsapp.accessToken).toBe('test-access-token');
    expect(config.whatsapp.appSecret).toBe('test-app-secret');
    expect(config.whatsapp.webhookVerifyToken).toBe('test-verify-token');
  });

  it('overrides env values with decrypted values from whatsapp.json', () => {
    const fileToken = 'file-override-token';
    const fileSecret = 'file-override-secret';
    const fileVerifyToken = 'file-override-verify';

    const whatsappJson = {
      graphApiVersion: 'v22.0',
      phoneNumberId: envToJsonPhoneId,
      businessAccountId: envToJsonBusinessId,
      accessToken: encryptWhatsappSecret(fileToken),
      appSecret: encryptWhatsappSecret(fileSecret),
      webhookVerifyToken: encryptWhatsappSecret(fileVerifyToken),
    };

    vi.mocked(readFileSync).mockImplementationOnce(() => Buffer.from(JSON.stringify(whatsappJson), 'utf8'));

    const config = loadConfig(baseEnv);

    // File values override env
    expect(config.whatsapp.accessToken).toBe(fileToken);
    expect(config.whatsapp.appSecret).toBe(fileSecret);
    expect(config.whatsapp.webhookVerifyToken).toBe(fileVerifyToken);
    // Non-sensitive fields from file also override
    expect(config.whatsapp.graphApiVersion).toBe('v22.0');
  });

  it('uses plaintext value from whatsapp.json when not encrypted (backward compat)', () => {
    const plaintextToken = 'unencrypted-legacy-token';

    const whatsappJson = {
      accessToken: plaintextToken, // stored as plaintext, not encrypted
      appSecret: encryptWhatsappSecret('encrypted-secret-value'),
    };

    vi.mocked(readFileSync).mockImplementationOnce(() => Buffer.from(JSON.stringify(whatsappJson), 'utf8'));

    const config = loadConfig(baseEnv);

    expect(config.whatsapp.accessToken).toBe(plaintextToken);
    expect(config.whatsapp.appSecret).toBe('encrypted-secret-value');
  });

  it('fills missing fields from env when file has only partial data', () => {
    const whatsappJson = {
      accessToken: encryptWhatsappSecret('from-file-token'),
      // appSecret and webhookVerifyToken are NOT in the file
    };

    vi.mocked(readFileSync).mockImplementationOnce(() => Buffer.from(JSON.stringify(whatsappJson), 'utf8'));

    const config = loadConfig(baseEnv);

    expect(config.whatsapp.accessToken).toBe('from-file-token');
    // These fall back to env
    expect(config.whatsapp.appSecret).toBe('test-app-secret');
    expect(config.whatsapp.webhookVerifyToken).toBe('test-verify-token');
    // Non-sensitive fields fall back to env
    expect(config.whatsapp.graphApiVersion).toBe('v21.0');
    expect(config.whatsapp.phoneNumberId).toBe('test-phone-number-id');
  });
});

// Re-encrypt once per test run for deterministic references
const envToJsonPhoneId = 'test-phone-number-id';
const envToJsonBusinessId = 'test-waba-id';
