import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';

import { GET, POST } from '@/app/api/settings/whatsapp/route';

// Mock fs/promises and the session guard
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(() => { throw new Error('ENOENT'); }),
  writeFile: vi.fn(),
}));

vi.mock('@/modules/auth/guards', () => ({
  getVerifiedSession: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const mockSession = { userId: 'admin-1', email: 'admin@test.com', name: 'Admin', role: 'ADMIN' as const, permissions: undefined };
const previousWhatsappSettingsKey = process.env.WHATSAPP_SETTINGS_KEY;

async function setAdmin() {
  const guards = await import('@/modules/auth/guards');
  vi.mocked(guards.getVerifiedSession).mockResolvedValue(mockSession);
}

async function setNonAdmin() {
  const guards = await import('@/modules/auth/guards');
  vi.mocked(guards.getVerifiedSession).mockResolvedValue({ ...mockSession, role: 'OPERATOR' as const });
}

async function setUnauthenticated() {
  const guards = await import('@/modules/auth/guards');
  vi.mocked(guards.getVerifiedSession).mockResolvedValue(null);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WHATSAPP_SETTINGS_KEY = 'unit-test-whatsapp-settings-key';
});

afterEach(() => {
  vi.clearAllMocks();
  if (previousWhatsappSettingsKey === undefined) {
    delete process.env.WHATSAPP_SETTINGS_KEY;
    return;
  }
  process.env.WHATSAPP_SETTINGS_KEY = previousWhatsappSettingsKey;
});

describe('GET /api/settings/whatsapp', () => {
  it('returns 403 for unauthenticated users', async () => {
    await setUnauthenticated();
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 403 for non-ADMIN users', async () => {
    await setNonAdmin();
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns webhookUrl based on APP_URL', async () => {
    await setAdmin();
    vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT'));

    const res = await GET();
    const body = await res.json();

    expect(body.webhookUrl).toContain('/api/webhooks/whatsapp');
    expect(body.webhookUrl).toBe(`${process.env.APP_URL}/api/webhooks/whatsapp`);
  });

  it('returns non-sensitive fields from the file when present', async () => {
    await setAdmin();

    const fileContent = {
      graphApiVersion: 'v22.0',
      phoneNumberId: 'file-phone-id',
      businessAccountId: 'file-biz-id',
      accessToken: 'encrypted:token:here',
      appSecret: 'encrypted:secret:here',
      webhookVerifyToken: 'encrypted:verify:here',
    };

    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(fileContent));

    const res = await GET();
    const body = await res.json();

    expect(body.graphApiVersion).toBe('v22.0');
    expect(body.phoneNumberId).toBe('file-phone-id');
    expect(body.businessAccountId).toBe('file-biz-id');
  });

  it('NEVER returns accessToken, appSecret, or webhookVerifyToken in plaintext', async () => {
    await setAdmin();

    const fileContent = {
      accessToken: 'encrypted-token-hex:morehex:authhex',
      appSecret: 'encrypted-secret-hex:morehex:authhex',
      webhookVerifyToken: 'encrypted-verify-hex:morehex:authhex',
    };

    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(fileContent));

    const res = await GET();
    const body = await res.json();

    expect(body.accessToken).toBeUndefined();
    expect(body.appSecret).toBeUndefined();
    expect(body.webhookVerifyToken).toBeUndefined();
  });

  it('returns boolean indicators for which secrets are configured', async () => {
    await setAdmin();

    const fileContent = {
      accessToken: 'encrypted-token:value:hex',
      // appSecret missing
      webhookVerifyToken: 'encrypted-verify:value:hex',
    };

    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(fileContent));

    // Remove env vars so only file values determine "configured" state
    const prevToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const prevSecret = process.env.WHATSAPP_APP_SECRET;
    const prevVerify = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_APP_SECRET;
    delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    try {
      const res = await GET();
      const body = await res.json();

      expect(body.accessTokenConfigured).toBe(true);
      expect(body.appSecretConfigured).toBe(false);
      expect(body.webhookVerifyTokenConfigured).toBe(true);
    } finally {
      if (prevToken) process.env.WHATSAPP_ACCESS_TOKEN = prevToken;
      if (prevSecret) process.env.WHATSAPP_APP_SECRET = prevSecret;
      if (prevVerify) process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = prevVerify;
    }
  });

  it('returns all configured as false when no file exists and env vars are not set', async () => {
    await setAdmin();
    vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT'));

    const prevToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const prevSecret = process.env.WHATSAPP_APP_SECRET;
    const prevVerify = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_APP_SECRET;
    delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    try {
      const res = await GET();
      const body = await res.json();

      expect(body.accessTokenConfigured).toBe(false);
      expect(body.appSecretConfigured).toBe(false);
      expect(body.webhookVerifyTokenConfigured).toBe(false);
    } finally {
      if (prevToken) process.env.WHATSAPP_ACCESS_TOKEN = prevToken;
      if (prevSecret) process.env.WHATSAPP_APP_SECRET = prevSecret;
      if (prevVerify) process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = prevVerify;
    }
  });
});

describe('POST /api/settings/whatsapp', () => {
  it('returns 403 for unauthenticated users', async () => {
    await setUnauthenticated();
    const req = new Request('http://localhost/api/settings/whatsapp', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('encrypts sensitive fields before saving', async () => {
    await setAdmin();
    vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT'));

    const fd = new FormData();
    fd.append('accessToken', 'my-new-token');
    fd.append('appSecret', 'my-new-secret');
    fd.append('webhookVerifyToken', 'my-new-verify');
    fd.append('graphApiVersion', 'v22.0');

    const req = new Request('http://localhost/api/settings/whatsapp', { method: 'POST', body: fd });
    const res = await POST(req);
    const body = await res.json();

    expect(body.ok).toBe(true);

    // Verify writeFile was called with encrypted data
    expect(writeFile).toHaveBeenCalledTimes(1);
    const written = vi.mocked(writeFile).mock.calls[0][1] as string;
    const saved = JSON.parse(written);

    expect(saved.accessToken).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/i);
    expect(saved.appSecret).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/i);
    expect(saved.webhookVerifyToken).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/i);
    expect(saved.graphApiVersion).toBe('v22.0');
  });

  it('keeps existing values when fields are left blank', async () => {
    await setAdmin();

    const existing = {
      accessToken: 'existing:encrypted:token',
      appSecret: 'existing:encrypted:secret',
      graphApiVersion: 'v21.0',
    };

    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(existing));

    const fd = new FormData();
    fd.append('accessToken', 'new-token-val');
    fd.append('appSecret', ''); // blank → keep existing
    fd.append('graphApiVersion', 'v22.0');

    const req = new Request('http://localhost/api/settings/whatsapp', { method: 'POST', body: fd });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(writeFile).toHaveBeenCalledTimes(1);
    const written = vi.mocked(writeFile).mock.calls[0][1] as string;
    const saved = JSON.parse(written);

    // appSecret should be kept from existing
    expect(saved.appSecret).toBe('existing:encrypted:secret');
    // accessToken should be encrypted new value
    expect(saved.accessToken).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/i);
    expect(saved.accessToken).not.toBe('existing:encrypted:token');
    // Non-sensitive updated
    expect(saved.graphApiVersion).toBe('v22.0');
  });
});
