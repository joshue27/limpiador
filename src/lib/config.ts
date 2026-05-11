import { readFileSync } from 'node:fs';
import { z } from 'zod';

import { settingsFilePath } from '@/lib/settings-files';
import { decryptWhatsappSecret, isEncrypted } from '@/modules/settings/whatsapp-crypto';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  SESSION_COOKIE_NAME: z.string().min(1).default('limpiador_session'),
  SESSION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 7),
  LOGIN_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  API_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  MEDIA_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(25 * 1024 * 1024),
  WHATSAPP_GRAPH_API_VERSION: z.string().min(1).default('v21.0'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(''),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional().default(''),
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(''),
  WHATSAPP_APP_SECRET: z.string().optional().default(''),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional().default(''),
  PRIVATE_MEDIA_ROOT: z.string().min(1),
  PRIVATE_EXPORT_ROOT: z.string().min(1),
  TIMEZONE: z.string().min(1).default('America/Guatemala'),
  PRIVATE_BACKUP_ROOT: z.string().min(1).default('/var/backups/limpiador/postgres'),
  WHATSAPP_WINDOW_BYPASS: z
    .enum(['true', 'false', '1', '0'])
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
});

interface WhatsappJson {
  graphApiVersion?: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  accessToken?: string;
  appSecret?: string;
  webhookVerifyToken?: string;
}

function tryReadWhatsappJson(): WhatsappJson | null {
  try {
    const raw = readFileSync(settingsFilePath('whatsapp.json'), 'utf-8');
    return JSON.parse(raw) as WhatsappJson;
  } catch {
    return null;
  }
}

function decryptIfNeeded(value: string): string {
  if (!value) return value;
  if (isEncrypted(value)) {
    return decryptWhatsappSecret(value);
  }
  return value;
}

function buildWhatsappConfig(env: ReturnType<typeof envSchema.parse>, appUrl: string) {
  const file = tryReadWhatsappJson();

  const resolve = (field: keyof WhatsappJson, envValue: string): string => {
    if (file && file[field] !== undefined && file[field] !== '') {
      return decryptIfNeeded(file[field]!);
    }
    return envValue || '';
  };

  return {
    graphApiVersion: file?.graphApiVersion || env.WHATSAPP_GRAPH_API_VERSION,
    phoneNumberId: resolve('phoneNumberId', env.WHATSAPP_PHONE_NUMBER_ID),
    businessAccountId: resolve('businessAccountId', env.WHATSAPP_BUSINESS_ACCOUNT_ID),
    accessToken: resolve('accessToken', env.WHATSAPP_ACCESS_TOKEN),
    appSecret: resolve('appSecret', env.WHATSAPP_APP_SECRET),
    webhookVerifyToken: resolve('webhookVerifyToken', env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
    webhookUrl: `${appUrl}/api/webhooks/whatsapp`,
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env) {
  const env = envSchema.parse(source);

  return {
    nodeEnv: env.NODE_ENV,
    appUrl: env.APP_URL,
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    session: {
      secret: env.SESSION_SECRET,
      cookieName: env.SESSION_COOKIE_NAME,
      ttlSeconds: env.SESSION_TTL_SECONDS,
      secureCookies: env.NODE_ENV === 'production',
    },
    rateLimits: {
      login: {
        windowSeconds: env.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
        max: env.LOGIN_RATE_LIMIT_MAX,
      },
      api: {
        windowSeconds: env.API_RATE_LIMIT_WINDOW_SECONDS,
        max: env.API_RATE_LIMIT_MAX,
      },
    },
    whatsapp: buildWhatsappConfig(env, env.APP_URL),
    storage: {
      mediaRoot: env.PRIVATE_MEDIA_ROOT,
      exportRoot: env.PRIVATE_EXPORT_ROOT,
      backupRoot: env.PRIVATE_BACKUP_ROOT,
      mediaMaxBytes: env.MEDIA_MAX_BYTES,
    },
    timezone: env.TIMEZONE,
    whatsappWindowBypass: env.WHATSAPP_WINDOW_BYPASS,
  } as const;
}

export function getConfig() {
  return loadConfig();
}
