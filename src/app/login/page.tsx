import { readFile } from 'node:fs/promises';
import type { CSSProperties } from 'react';

import { settingsFilePath } from '@/lib/settings-files';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

async function getAccentColor(): Promise<string | null> {
  try {
    const data = await readFile(settingsFilePath('branding.json'), 'utf-8');
    const settings = JSON.parse(data) as { accentColor?: string };
    return settings.accentColor || null;
  } catch {
    return null;
  }
}

export default async function LoginPage() {
  const accentColor = await getAccentColor();

  return (
    <div className="login-page" style={accentColor ? ({ '--accent': accentColor } as CSSProperties) : undefined}>
      <div className="login-card">
        <LoginForm />
        <div style={{ marginTop: 16, fontSize: '0.75rem' }}>
          <a href="/privacy" style={{ color: '#9ca3af' }}>Política de Privacidad</a>
        </div>
      </div>
    </div>
  );
}
