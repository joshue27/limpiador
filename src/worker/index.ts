import { Worker } from 'bullmq';
import { Prisma } from '@prisma/client';

import { getConfig } from '@/lib/config';
import { createLifecycle, type Lifecycle } from '@/lib/lifecycle';
import { disconnectPrisma, prisma } from '@/lib/prisma';
import { disconnectRateLimitRedis } from '@/lib/rate-limit';
import {
  isAllowedMediaMime,
  safeMediaStorageKey,
  sha256Hex,
  writePrivateMedia,
} from '@/modules/media/storage';
import { closeQueueProducers, enqueueCampaignSend, redisConnection } from '@/modules/queue/queues';
import { processRestoreRun } from '@/modules/restore/processor';
import { launchScheduledCampaign } from '@/modules/campaigns/launch';
import { createWhatsAppCloudClient } from '@/modules/whatsapp/client';
import { generateExportZip } from './export-generator';
import { generateConversationExport } from './conversation-export';
import { generateChatExport } from './chat-export';
import { generateContactExport } from './contact-export';
import { runDailyExports } from './daily-exports';
import { runRetentionCleanup } from './retention';

const CAMPAIGN_SEND_DELAY_MS = 3000;
const DEFAULT_WORKER_CLOSE_TIMEOUT_MS = 10_000;

type WorkerLike = {
  name: string;
  close: (force?: boolean) => Promise<void>;
};

type WorkerRuntimeOptions = {
  workers: WorkerLike[];
  cleanupTasks?: Array<() => void>;
  closeQueueProducers: () => Promise<void>;
  disconnectRateLimitRedis: () => Promise<void>;
  disconnectPrisma: () => Promise<void>;
  lifecycle: Pick<Lifecycle, 'attachProcessHandlers' | 'register'>;
  closeTimeoutMs?: number;
};

type CampaignSendJobData = {
  campaignId: string;
  recipientId: string;
  contactWaId: string;
  templateName: string;
  templateLanguage: string;
  attempt: number;
  contactData?: { displayName?: string | null; phone?: string };
};

type CampaignSendClient = {
  sendTemplate: (input: {
    to: string;
    templateName: string;
    languageCode: string;
    components?: Array<{ type: 'body'; parameters: Array<{ type: 'text'; text: string }> }>;
  }) => Promise<{ messages?: Array<{ id?: string }> }>;
};

type CampaignRecipientSuccessStatus = 'SENT' | 'DELIVERED' | 'READ';

type CampaignSendPrisma = {
  campaignRecipient: {
    findUnique: (input: {
      where: { id: string };
      include: { campaign: { select: { status: true; bodyPlaceholderMap: true } } };
    }) => Promise<{ status: string; contactId: string; campaign: { status: string; bodyPlaceholderMap: unknown } } | null>;
    update: (input: {
      where: { id: string };
      data: { status?: 'SENT' | 'FAILED'; wamid?: string; attemptCount: number; lastError: string | null };
    }) => Promise<unknown>;
    count: (input: {
      where: {
        campaignId: string;
        status: 'PENDING' | { in: CampaignRecipientSuccessStatus[] };
      };
    }) => Promise<number>;
    findFirst: (input: {
      where: { id: string };
      select: { csvData: true };
    }) => Promise<{ csvData: unknown } | null>;
  };
  campaign: {
    update: (input: {
      where: { id: string };
      data: { status: 'COMPLETED' | 'FAILED' };
    }) => Promise<unknown>;
  };
  messageTemplate: {
    findUnique: (input: {
      where: { name: string };
      select: { body: true };
    }) => Promise<{ body: string } | null>;
  };
  conversation?: {
    upsert: (input: {
      where: { contactId: string };
      create: {
        contactId: string;
        status: 'UNASSIGNED';
        lastMessageAt: Date;
        unreadCount: number;
      };
      update: { lastMessageAt: Date };
    }) => Promise<{ id: string }>;
  };
  message?: {
    upsert: (input: {
      where: { wamid: string };
      create: {
        wamid: string;
        contactId: string;
        conversationId: string;
        direction: 'OUTBOUND';
        type: 'TEMPLATE';
        body: string;
        status: 'SENT';
        sentAt: Date;
        rawJson: Prisma.InputJsonValue;
      };
      update: {
        contactId: string;
        conversationId: string;
        body: string;
        status: 'SENT';
        sentAt: Date;
        rawJson: Prisma.InputJsonValue;
      };
    }) => Promise<unknown>;
    create?: (input: {
      data: {
        contactId: string;
        conversationId: string;
        direction: 'OUTBOUND';
        type: 'TEMPLATE';
        body: string;
        status: 'SENT';
        sentAt: Date;
        rawJson: Prisma.InputJsonValue;
      };
    }) => Promise<unknown>;
  };
};

type CampaignSendDependencies = {
  prisma?: CampaignSendPrisma;
  client?: CampaignSendClient;
  delay?: (ms: number) => Promise<void>;
};

export type WorkerRuntime = {
  ok: true;
  workers: string[];
  close: () => Promise<void>;
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract unique placeholder numbers from a template body string like "Hola {{1}}, tu {{2}}". */
function extractPlaceholders(body: string): string[] {
  const tokens = new Set<string>();
  const re = /\{\{(\d+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    tokens.add(match[1]);
  }
  return [...tokens].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
}

function renderTemplateBody(body: string | null | undefined, valuesByPlaceholder: Record<string, string> = {}) {
  const source = body?.trim();
  if (!source) return '';
  return source.replace(/\{\{(\d+)\}\}/g, (_match, rawIndex) => {
    return valuesByPlaceholder[rawIndex] ?? `{{${rawIndex}}}`;
  });
}

async function processMediaDownload(mediaAssetId: string) {
  const config = getConfig();
  const client = createWhatsAppCloudClient();
  const asset = await prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } });

  if (!asset) return { skipped: true, reason: 'media_asset_missing' };
  if (asset.downloadStatus === 'READY' && asset.storageKey) {
    return { skipped: true, reason: 'already_ready', mediaAssetId };
  }

  await prisma.mediaAsset.update({
    where: { id: asset.id },
    data: { downloadStatus: 'DOWNLOADING', downloadError: null },
  });

  try {
    const metadata = await client.getMediaMetadata(asset.waMediaId);
    const mimeType = metadata.mime_type || asset.mimeType;
    if (!isAllowedMediaMime(mimeType)) {
      throw new Error(`Unsupported media type: ${mimeType}`);
    }

    if (metadata.file_size && metadata.file_size > config.storage.mediaMaxBytes) {
      throw new Error(`Media too large: ${metadata.file_size} bytes`);
    }

    const arrayBuffer = await client.downloadMedia(metadata.url);
    const bytes = Buffer.from(arrayBuffer);
    if (bytes.byteLength > config.storage.mediaMaxBytes) {
      throw new Error(`Media too large: ${bytes.byteLength} bytes`);
    }

    const actualSha256 = sha256Hex(bytes);
    if (metadata.sha256 && metadata.sha256 !== actualSha256) {
      throw new Error('Media checksum mismatch');
    }

    const filename = asset.filename ?? `${asset.waMediaId}.${mimeType.split('/')[1] || 'bin'}`;
    const storageKey = safeMediaStorageKey(asset.id, filename);
    await writePrivateMedia(config.storage.mediaRoot, storageKey, bytes);

    await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        downloadStatus: 'READY',
        downloadError: null,
        storageKey,
        mimeType,
        size: bytes.byteLength,
        sha256: actualSha256,
        filename,
      },
    });

    return { ok: true, mediaAssetId: asset.id, size: bytes.byteLength };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown media download error';
    await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { downloadStatus: 'FAILED', downloadError: message.slice(0, 500) },
    });
    throw error;
  }
}

export async function processCampaignSend(
  jobData: CampaignSendJobData,
  dependencies: CampaignSendDependencies = {},
) {
  const client = dependencies.client ?? createWhatsAppCloudClient();
  const campaignPrisma: CampaignSendPrisma = dependencies.prisma ?? prisma;
  const wait = dependencies.delay ?? delay;
  const {
    campaignId,
    recipientId,
    contactWaId,
    templateName,
    templateLanguage,
    attempt,
    contactData,
  } = jobData;

  const recipient = await campaignPrisma.campaignRecipient.findUnique({
    where: { id: recipientId },
    include: { campaign: { select: { status: true, bodyPlaceholderMap: true } } },
  });
  if (!recipient || recipient.campaign.status !== 'SENDING')
    return { skipped: true, reason: 'campaign_not_running' };
  if (recipient.status !== 'PENDING') return { skipped: true, reason: 'already_processed' };

  if (attempt > 1) {
    await wait(CAMPAIGN_SEND_DELAY_MS * attempt);
  }

  // Read template body to know which placeholders ({{1}}, {{2}}, etc.) it expects.
  const template = await campaignPrisma.messageTemplate.findUnique({
    where: { name: templateName },
    select: { body: true },
  });
  const placeholderTokens = extractPlaceholders(template?.body ?? '');

  // Read the campaign's placeholder→column mapping and the recipient's CSV data.
  const placeholderMap = (recipient.campaign.bodyPlaceholderMap ?? {}) as Record<string, string>;
  const csvRow = await campaignPrisma.campaignRecipient.findFirst({
    where: { id: recipientId },
    select: { csvData: true },
  });
  const csvData = (csvRow?.csvData ?? {}) as Record<string, string>;

  // Build body parameters: for each placeholder in the template, look up the
  // mapped column name in csvData. Fall back to contactData for {{1}}/{{2}}.
  const displayName = contactData?.displayName?.trim();
  const phone = contactData?.phone?.trim();
  const FALLBACK_MAP: Record<string, string | undefined> = {
    '1': displayName,
    '2': phone,
  };

  const resolvedParams = placeholderTokens
    .map((token) => {
      const column = placeholderMap[token];
      if (column) {
        const value = csvData[column]?.trim();
        if (value) return { type: 'text' as const, text: value };
      }
      // Fallback: {{1}}→displayName, {{2}}→phone
      const fallback = FALLBACK_MAP[token];
      if (fallback) return { type: 'text' as const, text: fallback };
      return null;
    });

  const bodyParams = resolvedParams.filter((p): p is { type: 'text'; text: string } => p !== null);

  if (bodyParams.length !== placeholderTokens.length) {
    const missing = placeholderTokens.filter((_, index) => !resolvedParams[index]);
    throw new Error(
      `Template variables missing data for placeholders: ${missing.map((token) => `{{${token}}}`).join(', ')}`,
    );
  }

  try {
    const response = await client.sendTemplate({
      to: contactWaId,
      templateName,
      languageCode: templateLanguage,
      ...(bodyParams.length > 0 ? { components: [{ type: 'body' as const, parameters: bodyParams }] } : {}),
    });
    const wamid = response.messages?.[0]?.id;
    const sentAt = new Date();

    await campaignPrisma.campaignRecipient.update({
      where: { id: recipientId },
      data: { status: 'SENT', wamid, attemptCount: attempt, lastError: null },
    });

    if (campaignPrisma.conversation && campaignPrisma.message) {
      const conversation = await campaignPrisma.conversation.upsert({
        where: { contactId: recipient.contactId },
        create: {
          contactId: recipient.contactId,
          status: 'UNASSIGNED',
          lastMessageAt: sentAt,
          unreadCount: 0,
        },
        update: { lastMessageAt: sentAt },
      });

      const renderedBody = renderTemplateBody(
        template?.body,
        Object.fromEntries(placeholderTokens.map((token, index) => [token, bodyParams[index]?.text ?? ''])),
      );
      const body = renderedBody || `Plantilla enviada: ${templateName} (${templateLanguage})`;
      const rawJson = {
        ...response,
        campaignId,
        campaignRecipientId: recipientId,
        templateName,
        templateLanguage,
      } as Prisma.InputJsonValue;

      if (wamid) {
        await campaignPrisma.message.upsert({
          where: { wamid },
          create: {
            wamid,
            contactId: recipient.contactId,
            conversationId: conversation.id,
            direction: 'OUTBOUND',
            type: 'TEMPLATE',
            body,
            status: 'SENT',
            sentAt,
            rawJson,
          },
          update: {
            contactId: recipient.contactId,
            conversationId: conversation.id,
            body,
            status: 'SENT',
            sentAt,
            rawJson,
          },
        });
      } else if (campaignPrisma.message.create) {
        await campaignPrisma.message.create({
          data: {
            contactId: recipient.contactId,
            conversationId: conversation.id,
            direction: 'OUTBOUND',
            type: 'TEMPLATE',
            body,
            status: 'SENT',
            sentAt,
            rawJson,
          },
        });
      }
    }

    // Check if all recipients are now processed (no more PENDING)
    const pendingCount = await campaignPrisma.campaignRecipient.count({
      where: { campaignId, status: 'PENDING' },
    });
    if (pendingCount === 0) {
      await campaignPrisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'COMPLETED' },
      });
    }

    return { ok: true, wamid };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const willRetry = attempt < 3;

    if (!willRetry) {
      await campaignPrisma.campaignRecipient.update({
        where: { id: recipientId },
        data: { status: 'FAILED', lastError: message.slice(0, 300), attemptCount: attempt },
      });
      await finalizeCampaignIfNoPendingRecipients(campaignId, campaignPrisma);
    } else {
      await campaignPrisma.campaignRecipient.update({
        where: { id: recipientId },
        data: { attemptCount: attempt, lastError: message.slice(0, 300) },
      });
    }

    throw error;
  }
}

async function finalizeCampaignIfNoPendingRecipients(
  campaignId: string,
  campaignPrisma: CampaignSendPrisma,
) {
  const pendingCount = await campaignPrisma.campaignRecipient.count({
    where: { campaignId, status: 'PENDING' },
  });
  if (pendingCount > 0) return;

  const sentCount = await campaignPrisma.campaignRecipient.count({
    where: { campaignId, status: { in: ['SENT', 'DELIVERED', 'READ'] } },
  });
  await campaignPrisma.campaign.update({
    where: { id: campaignId },
    data: { status: sentCount > 0 ? 'COMPLETED' : 'FAILED' },
  });
}

export async function startWorker(): Promise<WorkerRuntime> {
  const connection = redisConnection();
  const mediaWorker = new Worker(
    'media-downloads',
    async (job) => {
      const mediaAssetId = typeof job.data.mediaAssetId === 'string' ? job.data.mediaAssetId : '';
      if (!mediaAssetId) throw new Error('Missing mediaAssetId');
      return processMediaDownload(mediaAssetId);
    },
    { connection, concurrency: 2 },
  );

  const webhookWorker = new Worker(
    'webhook-events',
    async (job) => ({ acknowledged: true, id: job.data.id }),
    { connection, concurrency: 5 },
  );

  const campaignWorker = new Worker(
    'campaign-sends',
    async (job) => {
      console.log('[worker] Processing campaign job:', job.id);
      const data = job.data as {
        campaignId?: string;
        recipientId?: string;
        contactWaId?: string;
        templateName?: string;
        templateLanguage?: string;
        attempt?: number;
        contactData?: { displayName?: string | null; phone?: string };
      };
      if (!data.campaignId || !data.recipientId || !data.contactWaId || !data.templateName)
        throw new Error('Missing job data');
      return processCampaignSend({
        campaignId: data.campaignId,
        recipientId: data.recipientId,
        contactWaId: data.contactWaId,
        templateName: data.templateName,
        templateLanguage: data.templateLanguage ?? 'es',
        attempt: job.attemptsMade + 1,
        contactData: data.contactData,
      });
    },
    { connection, concurrency: 1 },
  );

  campaignWorker.on('failed', async (job, err) => {
    console.error(`[worker] Campaign send permanently failed: job=${job?.id}`, err?.message);
    const data = job?.data as {
      campaignId?: string;
      recipientId?: string;
      campaignRecipientStatus?: string;
    } | undefined;
    if (data?.campaignId && data?.recipientId) {
      try {
        const recipient = await prisma.campaignRecipient.findUnique({ where: { id: data.recipientId } });
        if (recipient?.status === 'PENDING') {
          await prisma.campaignRecipient.update({
            where: { id: data.recipientId },
            data: { status: 'FAILED', lastError: (err?.message ?? 'Job failed permanently').slice(0, 300) },
          });
          await finalizeCampaignIfNoPendingRecipients(data.campaignId, prisma);
        }
      } catch (cleanupError) {
        console.error('[worker] Failed to cleanup stuck recipient:', cleanupError);
      }
    }
  });

  console.log('[worker] Campaign worker started, listening for jobs...');

  const exportWorker = new Worker(
    'export-generation',
    async (job) => {
      const { exportRunId, from, to, type } = job.data as {
        exportRunId: string;
        from: string;
        to: string;
        type?: string;
      };
      if (!exportRunId || !from || !to) throw new Error('Missing export job data');

      await prisma.exportRun.update({
        where: { id: exportRunId },
        data: { status: 'RUNNING', startedAt: new Date() },
      });
      try {
        if (type === 'conversations') {
          const { total, size } = await generateConversationExport(
            prisma,
            getConfig().storage.mediaRoot,
            getConfig().storage.exportRoot,
            exportRunId,
            from,
            to,
          );
          console.log(
            `[worker] Conversation export ${exportRunId} completed: ${total} conversations, ${size} bytes`,
          );
          return { total, size };
        }

        if (type === 'contacts') {
          const { total, size } = await generateContactExport(
            prisma,
            getConfig().storage.exportRoot,
            exportRunId,
            from,
            to,
          );
          console.log(
            `[worker] Contact export ${exportRunId} completed: ${total} contacts, ${size} bytes`,
          );
          return { total, size };
        }

        if (type === 'chat') {
          const { total, size } = await generateChatExport(
            prisma,
            getConfig().storage.exportRoot,
            exportRunId,
            from,
            to,
          );
          console.log(
            `[worker] Chat export ${exportRunId} completed: ${total} messages, ${size} bytes`,
          );
          return { total, size };
        }

        const { total, size } = await generateExportZip(
          prisma,
          getConfig().storage.mediaRoot,
          getConfig().storage.exportRoot,
          exportRunId,
          from,
          to,
        );
        console.log(`[worker] Export ${exportRunId} completed: ${total} files, ${size} bytes`);
        return { total, size };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown export error';
        await prisma.exportRun.update({
          where: { id: exportRunId },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            countsJson: { error: message.slice(0, 500) },
          },
        });
        throw error;
      }
    },
    { connection, concurrency: 1 },
  );

  console.log('[worker] Export worker started');

  const restoreWorker = new Worker(
    'restore-processing',
    async (job) => {
      const data = job.data as { restoreRunId?: string; archivePath?: string; userId?: string };
      if (!data.restoreRunId || !data.archivePath || !data.userId) throw new Error('Missing restore job data');
      return processRestoreRun({ restoreRunId: data.restoreRunId, archivePath: data.archivePath, userId: data.userId });
    },
    { connection, concurrency: 1 },
  );

  console.log('[worker] Restore worker started');

  // Scheduled campaign checker — runs every 30s
  async function processScheduledCampaigns() {
    const now = new Date();
    const campaigns = await prisma.campaign.findMany({
      where: { status: 'QUEUED', scheduledAt: { lte: now } },
      include: {
        recipients: {
          where: { status: 'PENDING' },
          include: { contact: { select: { waId: true, displayName: true, phone: true } } },
        },
      },
    });

    for (const campaign of campaigns) {
      console.log(`[worker] Launching scheduled campaign: ${campaign.name}`);
      await launchScheduledCampaign({ campaign, prisma, enqueueCampaignSend });
    }
  }

  // Run scheduler periodically
  const schedulerInterval = setInterval(() => {
    processScheduledCampaigns().catch((err) => console.error('[worker] Scheduler error:', err));
  }, 30000);
  processScheduledCampaigns().catch((err) => console.error('[worker] Scheduler error:', err));

  // Daily exports to Google Drive — runs every 24 hours (plus once on startup)
  const dailyExportInterval = setInterval(
    () => {
      runDailyExports().catch((err) => console.error('[worker] Daily export error:', err));
    },
    24 * 60 * 60 * 1000,
  );
  const dailyExportStartupTimeout = setTimeout(() => {
    runDailyExports().catch((err) => console.error('[worker] Daily export error:', err));
  }, 10000); // First run after 10 seconds on startup

  // Daily retention cleanup — runs every 24 hours (plus once on startup)
  const retentionInterval = setInterval(
    () => {
      runRetentionCleanup().catch((err) => console.error('[worker] Retention error:', err));
    },
    24 * 60 * 60 * 1000,
  );
  const retentionStartupTimeout = setTimeout(() => {
    runRetentionCleanup().catch((err) => console.error('[worker] Retention error:', err));
  }, 30000); // First run after 30 seconds

  return createWorkerRuntime({
    workers: [mediaWorker, webhookWorker, campaignWorker, exportWorker, restoreWorker],
    cleanupTasks: [
      () => clearInterval(schedulerInterval),
      () => clearInterval(dailyExportInterval),
      () => clearInterval(retentionInterval),
      () => clearTimeout(dailyExportStartupTimeout),
      () => clearTimeout(retentionStartupTimeout),
    ],
    closeQueueProducers,
    disconnectRateLimitRedis,
    disconnectPrisma,
    lifecycle: createLifecycle(),
  });
}

export function createWorkerRuntime(options: WorkerRuntimeOptions): WorkerRuntime {
  let closePromise: Promise<void> | undefined;
  const closeTimeoutMs = options.closeTimeoutMs ?? DEFAULT_WORKER_CLOSE_TIMEOUT_MS;

  const close = async () => {
    closePromise ??= closeRuntime(options, closeTimeoutMs);
    return closePromise;
  };

  const runtime: WorkerRuntime = {
    ok: true,
    workers: options.workers.map((worker) => worker.name),
    close,
  };

  options.lifecycle.register('worker-runtime', runtime.close);
  options.lifecycle.attachProcessHandlers();

  return runtime;
}

async function closeRuntime(options: WorkerRuntimeOptions, closeTimeoutMs: number): Promise<void> {
  for (const cleanup of options.cleanupTasks ?? []) {
    cleanup();
  }

  for (const worker of options.workers) {
    await withTimeout(worker.close(false), closeTimeoutMs);
  }

  await options.closeQueueProducers();
  await options.disconnectRateLimitRedis();
  await options.disconnectPrisma();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Worker shutdown exceeded ${timeoutMs}ms`)),
      timeoutMs,
    );
    timer.unref?.();
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

if (process.env.NODE_ENV !== 'test') {
  void startWorker();
}
