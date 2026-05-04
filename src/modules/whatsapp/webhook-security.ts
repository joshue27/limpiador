import { createHmac, timingSafeEqual } from 'node:crypto';

import { getConfig } from '@/lib/config';

export function verifyWebhookChallenge(mode: string | null, token: string | null, challenge: string | null) {
  if (mode === 'subscribe' && token === getConfig().whatsapp.webhookVerifyToken && challenge) {
    return challenge;
  }

  return null;
}

export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null) {
  if (!signatureHeader?.startsWith('sha256=')) {
    return false;
  }

  const appSecret = getConfig().whatsapp.appSecret?.trim();
  if (!appSecret) {
    return false;
  }

  const expected = createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex');
  const received = signatureHeader.replace('sha256=', '');

  const expectedBuffer = Buffer.from(expected, 'hex');
  const receivedBuffer = Buffer.from(received, 'hex');

  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}
