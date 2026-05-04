import { Queue } from 'bullmq';

import { getConfig } from '@/lib/config';

export function redisConnection() {
  const url = new URL(getConfig().redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
  };
}

let mediaQueue: Queue | undefined;
let webhookQueue: Queue | undefined;
let campaignQueue: Queue | undefined;
let restoreQueue: Queue | undefined;

const queueProducers = new Set<Queue>();

function trackQueue(queue: Queue): Queue {
  queueProducers.add(queue);
  return queue;
}

export function getMediaQueue() {
  mediaQueue ??= trackQueue(new Queue('media-downloads', { connection: redisConnection() }));
  return mediaQueue;
}

export function getWebhookQueue() {
  webhookQueue ??= trackQueue(new Queue('webhook-events', { connection: redisConnection() }));
  return webhookQueue;
}

export function getCampaignQueue() {
  campaignQueue ??= trackQueue(new Queue('campaign-sends', { connection: redisConnection() }));
  return campaignQueue;
}

export async function closeQueueProducers(): Promise<void> {
  const producers = [...queueProducers];
  queueProducers.clear();
  mediaQueue = undefined;
  webhookQueue = undefined;
  campaignQueue = undefined;
  exportQueue = undefined;
  restoreQueue = undefined;

  for (const producer of producers) {
    await producer.close();
  }
}

export async function enqueueMediaDownload(mediaAssetId: string) {
  return getMediaQueue().add('download-media', { mediaAssetId }, { jobId: `media-${mediaAssetId}`, attempts: 5, backoff: { type: 'exponential', delay: 30_000 } });
}

export async function enqueueWebhookEvent(kind: string, id: string) {
  return getWebhookQueue().add(kind, { id }, { jobId: `${kind}:${id}`, attempts: 3, backoff: { type: 'exponential', delay: 10_000 } });
}

export async function enqueueCampaignSend(campaignId: string, recipientId: string, contactWaId: string, templateName: string, templateLanguage: string, attempt: number, contactData?: { displayName?: string | null; phone?: string }) {
  return getCampaignQueue().add('send-template', { campaignId, recipientId, contactWaId, templateName, templateLanguage, attempt, contactData }, { jobId: `campaign-${recipientId}`, attempts: 3, backoff: { type: 'exponential', delay: 60_000 } });
}

let exportQueue: Queue | undefined;

export function getExportQueue() {
  exportQueue ??= trackQueue(new Queue('export-generation', { connection: redisConnection() }));
  return exportQueue;
}

export function getRestoreQueue() {
  restoreQueue ??= trackQueue(new Queue('restore-processing', { connection: redisConnection() }));
  return restoreQueue;
}

export async function enqueueExportGeneration(exportRunId: string, from: string, to: string) {
  return getExportQueue().add('generate-zip', { exportRunId, from, to, type: 'media' }, { jobId: `export-${exportRunId}`, attempts: 2, backoff: { type: 'fixed', delay: 10_000 } });
}

export async function enqueueConversationExport(exportRunId: string, from: string, to: string) {
  return getExportQueue().add('generate-zip', { exportRunId, from, to, type: 'conversations' }, { jobId: `export-${exportRunId}`, attempts: 2, backoff: { type: 'fixed', delay: 10_000 } });
}

export async function enqueueContactExport(exportRunId: string, from: string, to: string) {
  return getExportQueue().add('generate-zip', { exportRunId, from, to, type: 'contacts' }, { jobId: `export-${exportRunId}`, attempts: 2, backoff: { type: 'fixed', delay: 10_000 } });
}

export async function enqueueChatExport(exportRunId: string, from: string, to: string) {
  return getExportQueue().add('generate-zip', { exportRunId, from, to, type: 'chat' }, { jobId: `export-${exportRunId}`, attempts: 2, backoff: { type: 'fixed', delay: 10_000 } });
}

export async function enqueueRestoreProcessing(restoreRunId: string, archivePath: string, userId: string) {
  return getRestoreQueue().add('process-restore', { restoreRunId, archivePath, userId }, { jobId: `restore-${restoreRunId}`, attempts: 1 });
}
