import { NextResponse, type NextRequest } from 'next/server';

import { ingestWhatsAppWebhook } from '@/modules/whatsapp/ingestion';
import { verifyWebhookChallenge, verifyWebhookSignature } from '@/modules/whatsapp/webhook-security';
import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const challenge = verifyWebhookChallenge(
    searchParams.get('hub.mode'),
    searchParams.get('hub.verify_token'),
    searchParams.get('hub.challenge'),
  );

  if (!challenge) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  return new NextResponse(challenge, { status: 200 });
}

export async function POST(request: NextRequest) {
  if (!getConfig().whatsapp.appSecret?.trim()) {
    return NextResponse.json({ error: 'Webhook app secret not configured' }, { status: 503 });
  }

  const rawBody = await request.text();

  if (!verifyWebhookSignature(rawBody, request.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const result = await ingestWhatsAppWebhook(payload);
  return NextResponse.json({ ok: true, ...result });
}
