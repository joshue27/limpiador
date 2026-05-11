import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import yauzl from 'yauzl';

import { getConfig } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import {
  markRestoreRunFailed,
  markRestoreRunReady,
  markRestoreRunRunning,
  type RestoreCounts,
} from '@/modules/restore/restore-job';

function cleanPhone(value: string) {
  return value.replace(/[\s().\-+]/g, '').trim();
}

type ParsedRestoreMessage = {
  time: string;
  direction: 'INBOUND' | 'OUTBOUND';
  type: string;
  body: string;
  media?: Array<{
    id: string;
    filename: string;
    mime: string;
    status: string;
    comprobante: boolean;
    size: number;
  }>;
};

/**
 * Read a single ZIP entry's content as a string via streaming.
 * Only safe for small entries (text files).
 */
function readEntryAsString(zipFile: yauzl.ZipFile, entry: yauzl.Entry): Promise<string> {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (err, readStream) => {
      if (err || !readStream) return reject(err || new Error('No stream'));
      const chunks: Buffer[] = [];
      readStream.on('data', (chunk: Buffer) => chunks.push(chunk));
      readStream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      readStream.on('error', reject);
    });
  });
}

/**
 * Stream a ZIP entry's content directly to a file on disk.
 */
function streamEntryToFile(
  zipFile: yauzl.ZipFile,
  entry: yauzl.Entry,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (err, readStream) => {
      if (err || !readStream) return reject(err || new Error('No stream'));
      const writeStream = createWriteStream(outputPath);
      readStream.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      readStream.on('error', reject);
    });
  });
}

/**
 * Open a ZIP file and process entries one-by-one using streaming.
 * Never loads the full archive into memory.
 */
function processZipStreaming(
  archivePath: string,
  onEntry: (zipFile: yauzl.ZipFile, entry: yauzl.Entry) => Promise<'continue' | 'stop'>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true, autoClose: true }, (err, zipFile) => {
      if (err || !zipFile) return reject(err || new Error('Cannot open ZIP'));

      zipFile.on('entry', async (entry: yauzl.Entry) => {
        try {
          const action = await onEntry(zipFile, entry);
          if (action === 'stop') {
            zipFile.close();
            resolve();
          } else {
            zipFile.readEntry();
          }
        } catch (error) {
          zipFile.close();
          reject(error);
        }
      });

      zipFile.on('end', resolve);
      zipFile.on('error', reject);
      zipFile.readEntry();
    });
  });
}

export async function processRestoreRun(input: {
  restoreRunId: string;
  archivePath: string;
  userId: string;
}): Promise<RestoreCounts> {
  await markRestoreRunRunning(prisma, input.restoreRunId);

  try {
    const result = await restoreArchiveStreaming(input.archivePath, input.userId);
    await markRestoreRunReady(prisma, input.restoreRunId, result);
    return result;
  } catch (error) {
    await markRestoreRunFailed(prisma, input.restoreRunId, error);
    throw error;
  } finally {
    await rm(input.archivePath, { force: true }).catch(() => undefined);
  }
}

async function restoreArchiveStreaming(
  archivePath: string,
  userId: string,
): Promise<RestoreCounts> {
  const mediaRoot = getConfig().storage.mediaRoot;
  await mkdir(mediaRoot, { recursive: true });

  // Map of assetId → media metadata, built as we process text entries
  const assetMediaMap = new Map<string, { messageId: string; mimeType: string; filename: string }>();

  let conversationsRestored = 0;
  let messagesRestored = 0;
  let mediaRestored = 0;

  // Phase 1: process all entries sequentially
  await processZipStreaming(archivePath, async (zipFile, entry) => {
    if (entry.fileName.endsWith('.txt')) {
      // Text file — parse conversation and create DB records
      const content = await readEntryAsString(zipFile, entry);
      const parsed = parseConversationText(content);
      if (!parsed.phone || parsed.messages.length === 0) return 'continue';

      const contact = await prisma.contact.upsert({
        where: { phone: parsed.phone },
        create: {
          waId: parsed.waId || parsed.phone,
          phone: parsed.phone,
          displayName: parsed.contactName || null,
        },
        update: { displayName: parsed.contactName || undefined },
      });

      let conversation = await prisma.conversation.findUnique({ where: { contactId: contact.id } });
      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: { contactId: contact.id, status: 'UNASSIGNED' },
        });
      }
      conversationsRestored++;

      for (const msg of parsed.messages) {
        const msgDate = new Date(msg.time);
        if (Number.isNaN(msgDate.getTime())) continue;

        const existing = await prisma.message.findFirst({
          where: { conversationId: conversation.id, body: msg.body, createdAt: msgDate },
        });
        if (existing) continue;

        const restored = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            contactId: contact.id,
            direction: msg.direction,
            type: msg.type === 'TEXT' ? 'TEXT' : 'UNKNOWN',
            body: msg.body,
            status: msg.direction === 'INBOUND' ? 'RECEIVED' : 'SENT',
            createdAt: msgDate,
            receivedAt: msg.direction === 'INBOUND' ? msgDate : undefined,
            sentAt: msg.direction === 'OUTBOUND' ? msgDate : undefined,
          },
        });
        messagesRestored++;

        // Store mapping from asset IDs to this message for media processing
        for (const asset of msg.media ?? []) {
          assetMediaMap.set(asset.id, {
            messageId: restored.id,
            mimeType: asset.mime || 'application/octet-stream',
            filename: asset.filename || asset.id,
          });
        }
      }

      return 'continue';
    }

    if (entry.fileName.includes('_media/')) {
      // Media file — stream to disk and create record
      const mediaFile = entry.fileName.split('/').at(-1) ?? '';
      const rawAssetId = mediaFile.split('_')[0];
      if (!rawAssetId) return 'continue';
      const assetId = rawAssetId.replace(/[^a-zA-Z0-9-]/g, '');
      if (!assetId) return 'continue';

      const outputPath = path.join(mediaRoot, `restored-${assetId}`);
      await streamEntryToFile(zipFile, entry, outputPath);

      // Use stored media metadata from text processing (mime, filename)
      const mediaInfo = assetMediaMap.get(assetId);
      if (mediaInfo) {
        await prisma.mediaAsset
          .create({
            data: {
              id: assetId,
              messageId: mediaInfo.messageId,
              waMediaId: `restored-${assetId}`,
              mimeType: mediaInfo.mimeType,
              filename: mediaInfo.filename,
              size: entry.uncompressedSize,
              downloadStatus: 'READY',
              isComprobante: false,
              storageKey: `restored-${assetId}`,
            },
          })
          .catch(() => undefined);
      }
      mediaRestored++;
      return 'continue';
    }

    return 'continue';
  });

  const counts = { conversationsRestored, messagesRestored, mediaRestored };
  await writeAuditLog({
    userId,
    action: AUDIT_ACTIONS.EXPORT_REQUESTED,
    entityType: 'conversation',
    metadata: { action: 'restore', ...counts },
  });
  return counts;
}

function parseConversationText(content: string) {
  const lines = content.split('\n');
  let contactName = '';
  let phone = '';
  let waId = '';
  const messages: ParsedRestoreMessage[] = [];
  let inHeader = true;

  for (const line of lines) {
    if (inHeader) {
      if (line.startsWith('Contacto: ')) contactName = line.slice(10).trim();
      else if (line.startsWith('Teléfono: ')) phone = cleanPhone(line.slice(10).trim());
      else if (line.startsWith('WA ID: ')) waId = cleanPhone(line.slice(7).trim());
      else if (line.startsWith('[') && line.includes(']')) inHeader = false;
      if (inHeader) continue;
    }

    const mediaMatch = line.match(
      /^MEDIA:\s*id=(.+?)\|filename=(.*?)\|mime=(.*?)\|status=(.*?)\|comprobante=(\d)\|size=(\d+)/,
    );
    if (mediaMatch) {
      const lastMsg = messages.at(-1);
      if (lastMsg) {
        lastMsg.media ??= [];
        lastMsg.media.push({
          id: mediaMatch[1] ?? '',
          filename: mediaMatch[2] ?? '',
          mime: mediaMatch[3] ?? 'application/octet-stream',
          status: mediaMatch[4] ?? 'PENDING',
          comprobante: mediaMatch[5] === '1',
          size: Number(mediaMatch[6] ?? 0),
        });
      }
      continue;
    }

    const msgMatch = line.match(/^\[(.+?)\]\s+(CLIENTE|OPERADOR)\s+\((\w+)\):\s*(.*)/);
    if (msgMatch) {
      messages.push({
        time: msgMatch[1] ?? '',
        direction: msgMatch[2] === 'CLIENTE' ? 'INBOUND' : 'OUTBOUND',
        type: msgMatch[3] ?? 'UNKNOWN',
        body: msgMatch[4] ?? '',
      });
    }
  }

  return { contactName, phone, waId, messages };
}
