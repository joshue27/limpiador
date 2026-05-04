import { NextResponse, type NextRequest } from 'next/server';
import { safeRedirect } from '@/lib/safe-redirect';

import { clearSessionCookie, getCurrentSession } from '@/modules/auth/session';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  await clearSessionCookie();

  if (session) {
    await writeAuditLog({ userId: session.userId, action: AUDIT_ACTIONS.LOGOUT_SUCCEEDED });
  }

  return NextResponse.redirect(safeRedirect(request, '/login'), { status: 303 });
}
