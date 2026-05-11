import './globals.css';
import { readFile } from 'node:fs/promises';

import { settingsFilePath } from '@/lib/settings-files';

export const metadata = {
  title: 'CleanApp WhatsApp Cloud',
  description: 'Gestión de conversaciones, campañas, comprobantes y exportaciones de WhatsApp.',
  icons: { icon: '/favicon.ico' },
};

async function getAccentColor(): Promise<string | null> {
  try {
    const data = await readFile(settingsFilePath('branding.json'), 'utf-8');
    const settings = JSON.parse(data) as { accentColor?: string };
    return settings.accentColor || null;
  } catch {
    return null;
  }
}

async function getTimezone(): Promise<string> {
  // Read from timezone.json first, then env var, then default
  try {
    const data = await readFile(settingsFilePath('timezone.json'), 'utf-8');
    const parsed = JSON.parse(data) as { timezone?: string };
    if (parsed.timezone?.trim()) return parsed.timezone.trim();
  } catch {
    // file not found, fall through
  }
  return process.env.TIMEZONE || 'America/Guatemala';
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [accentColor, timezone] = await Promise.all([getAccentColor(), getTimezone()]);
  return (
    <html lang="es">
      <body style={accentColor ? ({ '--accent': accentColor } as React.CSSProperties) : undefined}>
        <script dangerouslySetInnerHTML={{ __html: `window.__TIMEZONE__="${timezone}"` }} />
        {children}
      </body>
    </html>
  );
}
