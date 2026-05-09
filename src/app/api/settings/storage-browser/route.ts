import { NextResponse } from 'next/server';

import { getVerifiedSession } from '@/modules/auth/guards';
import { listStorageBrowserRoot } from '@/modules/settings/storage-browser-files';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Solo administradores' }, { status: 403 });
  }

  const [exportsRoot, databaseRoot] = await Promise.all([
    listStorageBrowserRoot('exports'),
    listStorageBrowserRoot('database'),
  ]);

  return NextResponse.json({ roots: [exportsRoot, databaseRoot] });
}
