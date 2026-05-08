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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const accentColor = await getAccentColor();
  return (
    <html lang="es">
      <body style={accentColor ? { '--accent': accentColor } as React.CSSProperties : undefined}>
        {children}
      </body>
    </html>
  );
}
