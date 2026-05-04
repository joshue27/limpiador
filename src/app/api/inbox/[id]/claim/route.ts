import { NextResponse } from 'next/server';
import { safeRedirect } from '@/lib/safe-redirect';

import { auditConversationAccessDenied } from '@/modules/inbox/access';
import { claimConversation } from '@/modules/inbox/assignment';
import { getVerifiedSession } from '@/modules/auth/guards';

export const runtime = 'nodejs';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getVerifiedSession();
  if (!session) {
    await auditConversationAccessDenied({ conversationId: id, reason: 'unauthenticated' });
    return NextResponse.json({ error: 'No tiene permiso para tomar este chat.' }, { status: 401 });
  }

  const result = await claimConversation(id, session);
  if (!result.ok) {
    if (result.status === 403) await auditConversationAccessDenied({ session, conversationId: id, reason: 'claim_forbidden' });
    const url = new URL(`/inbox?conversation=${id}`, _request.url);
    url.searchParams.set('chatNotice', result.error ?? 'Error al atender');
    url.searchParams.set('chatNoticeType', 'error');
    return NextResponse.redirect(url, { status: 303 });
  }
  return NextResponse.redirect(safeRedirect(_request, `/inbox?conversation=${id}`), { status: 303 });
}
