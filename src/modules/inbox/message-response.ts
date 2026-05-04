import { NextResponse } from 'next/server';

import type { QuotedMessageState } from '@/modules/inbox/message-history';

function wantsJson(request: Request) {
  return request.headers.get('accept')?.includes('application/json') ?? false;
}

function redirectToConversation(request: Request, conversationId: string, notice: string, type: 'success' | 'error') {
  const url = new URL('/inbox', request.url);
  url.searchParams.set('conversation', conversationId);
  url.searchParams.set('chatNotice', notice);
  url.searchParams.set('chatNoticeType', type);
  return NextResponse.redirect(url, { status: 303 });
}

export function messageResponse(
  request: Request,
  conversationId: string,
  notice: string,
  type: 'success' | 'error',
  status = 200,
  message?: QuotedMessageState,
) {
  if (wantsJson(request)) {
    const payload: Record<string, unknown> = { ok: type === 'success', notice, type };
    if (message) {
      payload.message = message;
    }
    return NextResponse.json(payload, { status });
  }

  return redirectToConversation(request, conversationId, notice, type);
}
