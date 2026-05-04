import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getVerifiedSession } from '@/modules/auth/guards';
import { formatSseEvent, parseRealtimeTopics } from '@/modules/realtime/sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const encoder = new TextEncoder();

export async function GET(request: Request) {
  const session = await getVerifiedSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const url = new URL(request.url);
  const topics = parseRealtimeTopics(url.searchParams.get('topics'));
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const emit = () => {
        buildRealtimeDigest(topics)
          .then((digest) => {
            if (!closed) controller.enqueue(encoder.encode(formatSseEvent({ id: String(Date.now()), event: 'digest', data: digest })));
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : 'Realtime digest failed';
            if (!closed) controller.enqueue(encoder.encode(formatSseEvent({ event: 'error', data: { message } })));
          });
      };
      emit();
      const timer = setInterval(emit, 15_000);
      request.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(timer);
        controller.close();
      }, { once: true });
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

async function buildRealtimeDigest(topics: ReturnType<typeof parseRealtimeTopics>) {
  const result: Record<string, string> = {};
  if (topics.includes('exports')) {
    const latest = await prisma.exportRun.findFirst({ orderBy: { updatedAt: 'desc' }, select: { id: true, status: true, updatedAt: true } });
    result.exports = latest ? `${latest.id}:${latest.status}:${latest.updatedAt.toISOString()}` : 'empty';
  }
  if (topics.includes('inbox') || topics.includes('notifications')) {
    const latest = await prisma.conversation.findFirst({ orderBy: { updatedAt: 'desc' }, select: { id: true, updatedAt: true, unreadCount: true } });
    result.inbox = latest ? `${latest.id}:${latest.unreadCount}:${latest.updatedAt.toISOString()}` : 'empty';
  }
  return result;
}
