import { createTransport } from 'nodemailer';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { settingsFilePath } from '@/lib/settings-files';

async function getBranding() {
  try {
    const data = await readFile(path.join(process.cwd(), 'branding.json'), 'utf-8');
    return JSON.parse(data) as { accentColor?: string };
  } catch {
    return {};
  }
}

async function getSmtpConfig(): Promise<{ host: string; port: number; user: string; pass: string; from: string } | null> {
  // Try file-based config first (set via settings UI)
  try {
    const data = await readFile(settingsFilePath('smtp.json'), 'utf-8');
    const config = JSON.parse(data) as { host?: string; port?: string; user?: string; pass?: string; from?: string };
    if (config.host && config.user && config.pass) {
      return {
        host: config.host,
        port: Number(config.port || 587),
        user: config.user,
        pass: config.pass,
        from: config.from || 'noreply@limpiador.app',
      };
    }
  } catch { /* no file */ }

  // Fall back to .env
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    return {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 587),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.SMTP_FROM || 'noreply@limpiador.app',
    };
  }

  return null;
}

export function isEmailConfigured(): Promise<boolean> {
  return getSmtpConfig().then(c => c !== null);
}

async function createTransporter() {
  const config = await getSmtpConfig();
  if (!config) throw new Error('SMTP not configured');
  const secure = config.port === 465;
  return createTransport({
    host: config.host,
    port: config.port,
    secure,
    auth: { user: config.user, pass: config.pass },
  });
}

export async function sendVerificationEmail(to: string, name: string, code: string) {
  const branding = await getBranding();
  const accent = branding.accentColor || '#075e54';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 0">
  <tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
      <tr><td style="background:${accent};padding:24px;text-align:center">
        <img src="${process.env.APP_URL || 'http://localhost:3000'}/brand-logo.png" alt="Logo" style="max-width:160px;max-height:48px" />
      </td></tr>
      <tr><td style="padding:32px 24px">
        <h2 style="margin:0 0 8px;color:#1f2937;font-size:1.2rem">Verificación · CleanApp</h2>
        <p style="color:#4b5563;font-size:0.9rem;line-height:1.5">Hola <strong>${name}</strong>, este es tu código de verificación:</p>
        <div style="text-align:center;margin:24px 0">
          <span style="display:inline-block;background:${accent};color:#fff;font-size:1.8rem;font-weight:700;padding:12px 32px;border-radius:6px;letter-spacing:6px">${code}</span>
        </div>
        <p style="color:#9ca3af;font-size:0.75rem">Este código es válido por 7 días. Si no solicitaste esta verificación, ignorá este mensaje.</p>
      </td></tr>
      <tr><td style="background:#f9fafb;padding:16px 24px;text-align:center;color:#9ca3af;font-size:0.7rem">
        CleanApp · WhatsApp Cloud Management
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const transporter = await createTransporter();
  await transporter.sendMail({
    from: (await getSmtpConfig())?.from || 'noreply@limpiador.app',
    to,
    subject: 'Código de verificación · CleanApp',
    html,
  });
}

export async function sendAssignmentEmail(to: string, name: string, contactName: string) {
  const branding = await getBranding();
  const accent = branding.accentColor || '#075e54';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 0">
  <tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
      <tr><td style="background:${accent};padding:24px;text-align:center">
        <img src="${process.env.APP_URL || 'http://localhost:3000'}/brand-logo.png" alt="Logo" style="max-width:160px;max-height:48px" />
      </td></tr>
      <tr><td style="padding:32px 24px">
        <h2 style="margin:0 0 8px;color:#1f2937;font-size:1.2rem">📨 Nueva conversación asignada</h2>
        <p style="color:#4b5563;font-size:0.9rem;line-height:1.5">Hola <strong>${name}</strong>, se te ha asignado una conversación con <strong>${contactName}</strong>.</p>
        <div style="text-align:center;margin:24px 0">
          <a href="${process.env.APP_URL || 'http://localhost:3000'}/inbox" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;font-weight:650;padding:10px 24px;border-radius:6px">Ver conversación</a>
        </div>
        <p style="color:#9ca3af;font-size:0.75rem">Ingresá a CleanApp para atender esta conversación.</p>
      </td></tr>
      <tr><td style="background:#f9fafb;padding:16px 24px;text-align:center;color:#9ca3af;font-size:0.7rem">
        CleanApp · WhatsApp Cloud Management
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const transporter = await createTransporter();
  await transporter.sendMail({
    from: (await getSmtpConfig())?.from || 'noreply@limpiador.app',
    to,
    subject: `Nueva conversación asignada · ${contactName}`,
    html,
  });
}
