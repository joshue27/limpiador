import './globals.css';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const metadata = {
  title: 'CleanApp WhatsApp Cloud',
  description: 'Gestión de conversaciones, campañas, comprobantes y exportaciones de WhatsApp.',
  icons: { icon: '/favicon.ico' },
};

async function getAccentColor(): Promise<string | null> {
  try {
    const data = await readFile(path.join(process.cwd(), 'branding.json'), 'utf-8');
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
