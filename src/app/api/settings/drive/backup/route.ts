import { NextResponse } from 'next/server';

import { getVerifiedSession } from '@/modules/auth/guards';
import { runDailyExports } from '@/worker/daily-exports';

export const runtime = 'nodejs';

export async function POST() {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  try {
    await runDailyExports({ trigger: 'manual' });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
