import { AppShell } from '@/components/app-shell';
import { requireSession } from '@/modules/auth/guards';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function getSidebarColor(): Promise<string | null> {
  try {
    const data = await readFile(path.join(process.cwd(), 'branding.json'), 'utf-8');
    const settings = JSON.parse(data) as { sidebarColor?: string };
    return settings.sidebarColor || null;
  } catch {
    return null;
  }
}

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const sidebarColor = await getSidebarColor();
  return <AppShell session={session} sidebarColor={sidebarColor}>{children}</AppShell>;
}
