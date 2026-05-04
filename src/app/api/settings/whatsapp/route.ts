import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { writeFile, readFile } from 'node:fs/promises';

import { settingsFilePath } from '@/lib/settings-files';
import { getVerifiedSession } from '@/modules/auth/guards';
import { encryptWhatsappSecret } from '@/modules/settings/whatsapp-crypto';

export const runtime = 'nodejs';

const WHATSAPP_FILE = settingsFilePath('whatsapp.json');

interface WhatsappStoredConfig {
  graphApiVersion?: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  accessToken?: string;
  appSecret?: string;
  webhookVerifyToken?: string;
}

async function readStoredConfig(): Promise<WhatsappStoredConfig> {
  try {
    const data = await readFile(WHATSAPP_FILE, 'utf-8');
    return JSON.parse(data) as WhatsappStoredConfig;
  } catch {
    return {};
  }
}

export async function GET() {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const stored = await readStoredConfig();
  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  return NextResponse.json({
    graphApiVersion: stored.graphApiVersion || process.env.WHATSAPP_GRAPH_API_VERSION || 'v21.0',
    phoneNumberId: stored.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    businessAccountId: stored.businessAccountId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
    accessTokenConfigured: Boolean(stored.accessToken || process.env.WHATSAPP_ACCESS_TOKEN),
    appSecretConfigured: Boolean(stored.appSecret || process.env.WHATSAPP_APP_SECRET),
    webhookVerifyTokenConfigured: Boolean(stored.webhookVerifyToken || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
    webhookUrl: `${appUrl}/api/webhooks/whatsapp`,
  });
}

export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Solo administradores' }, { status: 403 });
  }

  const formData = await request.formData();
  const existing = await readStoredConfig();

  const getField = (name: string): string => String(formData.get(name) ?? '').trim();

  const accessTokenInput = getField('accessToken');
  const appSecretInput = getField('appSecret');
  const webhookVerifyTokenInput = getField('webhookVerifyToken');
  const graphApiVersionInput = getField('graphApiVersion');
  const phoneNumberIdInput = getField('phoneNumberId');
  const businessAccountIdInput = getField('businessAccountId');

  const config: WhatsappStoredConfig = {};

  if ((accessTokenInput || appSecretInput || webhookVerifyTokenInput) && !process.env.WHATSAPP_SETTINGS_KEY?.trim()) {
    return NextResponse.json(
      { error: 'WHATSAPP_SETTINGS_KEY no está configurada en el servidor.' },
      { status: 503 },
    );
  }

  // Non-sensitive fields: overwrite if provided, keep existing otherwise
  config.graphApiVersion = graphApiVersionInput || existing.graphApiVersion || '';
  config.phoneNumberId = phoneNumberIdInput || existing.phoneNumberId || '';
  config.businessAccountId = businessAccountIdInput || existing.businessAccountId || '';

  // Sensitive fields: encrypt new values, keep existing if blank
  config.accessToken = accessTokenInput
    ? encryptWhatsappSecret(accessTokenInput)
    : (existing.accessToken || '');
  config.appSecret = appSecretInput
    ? encryptWhatsappSecret(appSecretInput)
    : (existing.appSecret || '');
  config.webhookVerifyToken = webhookVerifyTokenInput
    ? encryptWhatsappSecret(webhookVerifyTokenInput)
    : (existing.webhookVerifyToken || '');

  await writeFile(WHATSAPP_FILE, JSON.stringify(config), 'utf-8');
  revalidatePath('/settings');

  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  return NextResponse.json({ ok: true, webhookUrl: `${appUrl}/api/webhooks/whatsapp` });
}
