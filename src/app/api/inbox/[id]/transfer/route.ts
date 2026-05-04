import { NextResponse } from 'next/server';
import { safeRedirect } from '@/lib/safe-redirect';

import { getVerifiedSession } from '@/modules/auth/guards';
import { auditConversationAccessDenied } from '@/modules/inbox/access';
import { transferConversation } from '@/modules/inbox/assignment';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getVerifiedSession();
  if (!session) {
    await auditConversationAccessDenied({ conversationId: id, reason: 'unauthenticated' });
    return NextResponse.json({ error: 'No tiene permiso para transferir este chat.' }, { status: 401 });
  }

  const contentType = request.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? ((await request.json().catch(() => null)) as { toDepartmentId?: string; toUserId?: string; reason?: string } | null)
    : Object.fromEntries((await request.formData()).entries());
  const result = await transferConversation(id, session, {
    toDepartmentId: typeof body?.toDepartmentId === 'string' ? body.toDepartmentId : undefined,
    toUserId: typeof body?.toUserId === 'string' ? body.toUserId : undefined,
    reason: typeof body?.reason === 'string' ? body.reason : undefined,
  });
  if (!result.ok) {
    if (result.status === 403) await auditConversationAccessDenied({ session, conversationId: id, reason: 'transfer_forbidden' });
    if (!contentType.includes('application/json')) {
      const url = new URL(`/inbox?conversation=${id}`, request.url);
      url.searchParams.set('chatNotice', result.error ?? 'Error al transferir');
      url.searchParams.set('chatNoticeType', 'error');
      return NextResponse.redirect(url, { status: 303 });
    }
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (!contentType.includes('application/json')) {
    return NextResponse.redirect(safeRedirect(request, `/inbox?conversation=${id}&transferred=1`), { status: 303 });
  }
  return NextResponse.json({ ok: true });
}
