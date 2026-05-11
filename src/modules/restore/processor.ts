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
function streamEntryToFile(zipFile: yauzl.ZipFile, entry: yauzl.Entry, outputPath: string): Promise<void> {
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
 * Iterate ZIP entries, calling onEntry for each one.
 * Returns a Map of filename→content for entries whose onEntry returns a string.
 */
function collectZipEntries(
  archivePath: string,
  filter: (entry: yauzl.Entry) => boolean,
  reader: (zipFile: yauzl.ZipFile, entry: yauzl.Entry) => Promise<string>,
): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => {
    const result = new Map<string, string>();
    yauzl.open(archivePath, { lazyEntries: true, autoClose: true }, (err, zipFile) => {
      if (err || !zipFile) return reject(err || new Error('Cannot open ZIP'));

      zipFile.on('entry', async (entry: yauzl.Entry) => {
        try {
          if (filter(entry)) {
            const content = await reader(zipFile, entry);
            result.set(entry.fileName, content);
          }
          zipFile.readEntry();
        } catch (error) {
          zipFile.close();
          reject(error);
        }
      });

      zipFile.on('end', () => resolve(result));
      zipFile.on('error', reject);
      zipFile.readEntry();
    });
  });
}

export async function processRestoreRun(input: { restoreRunId: string; archivePath: string; userId: string }): Promise<RestoreCounts> {
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

async function restoreArchiveStreaming(archivePath: string, userId: string): Promise<RestoreCounts> {
  const mediaRoot = getConfig().storage.mediaRoot;
  await mkdir(mediaRoot, { recursive: true });

  // Phase 1: Read all text entries into memory (text files are small)
  const textContents = await collectZipEntries(
    archivePath,
    (entry) => entry.fileName.endsWith('.txt'),
    readEntryAsString,
  );

  // Phase 2: Process text entries → create DB records (including MediaAsset)
  let conversationsRestored = 0;
  let messagesRestored = 0;

  const validTypes = ['TEXT', 'IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT', 'STICKER', 'TEMPLATE', 'UNKNOWN'] as const;

  for (const [, content] of textContents) {
    const parsed = parseConversationText(content);
    if (!parsed.phone || parsed.messages.length === 0) continue;

    const contact = await prisma.contact.upsert({
      where: { phone: parsed.phone },
      create: { waId: parsed.waId || parsed.phone, phone: parsed.phone, displayName: parsed.contactName || null },
      update: { displayName: parsed.contactName || undefined },
    });

    let conversation = await prisma.conversation.findUnique({ where: { contactId: contact.id } });
    if (!conversation) {
      conversation = await prisma.conversation.create({ data: { contactId: contact.id, status: 'UNASSIGNED' } });
    }
    conversationsRestored++;

    for (const msg of parsed.messages) {
      const msgDate = new Date(msg.time);
      if (Number.isNaN(msgDate.getTime())) continue;

      const existing = await prisma.message.findFirst({
        where: { conversationId: conversation.id, body: msg.body, createdAt: msgDate },
      });
      if (existing) continue;

      const msgType = validTypes.includes(msg.type as typeof validTypes[number])
        ? msg.type as typeof validTypes[number]
        : 'UNKNOWN';

      const restored = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          contactId: contact.id,
          direction: msg.direction,
          type: msgType,
          body: msg.body,
          status: msg.direction === 'INBOUND' ? 'RECEIVED' : 'SENT',
          createdAt: msgDate,
          receivedAt: msg.direction === 'INBOUND' ? msgDate : undefined,
          sentAt: msg.direction === 'OUTBOUND' ? msgDate : undefined,
        },
      });
      messagesRestored++;

      // Create MediaAsset records from MEDIA line data (same as old JSZip code)
      for (const asset of msg.media ?? []) {
        await prisma.mediaAsset
          .upsert({
            where: { id: asset.id },
            create: {
              id: asset.id,
              messageId: restored.id,
              waMediaId: `restored-${asset.id}`,
              mimeType: asset.mime || 'application/octet-stream',
              filename: asset.filename || null,
              size: asset.size,
              downloadStatus: ['READY', 'PENDING', 'FAILED'].includes(asset.status) ? asset.status as 'READY' | 'PENDING' | 'FAILED' : 'PENDING',
              isComprobante: asset.comprobante,
              storageKey: `restored-${asset.id}`,
            },
            update: {
              messageId: restored.id,
              mimeType: asset.mime || 'application/octet-stream',
              filename: asset.filename || null,
              size: asset.size,
              downloadStatus: ['READY', 'PENDING', 'FAILED'].includes(asset.status) ? asset.status as 'READY' | 'PENDING' | 'FAILED' : 'PENDING',
              storageKey: `restored-${asset.id}`,
            },
          })
          .catch(() => undefined);
      }
    }
  }

  // Phase 3: Stream media entries to disk
  let mediaRestored = 0;
  await new Promise<void>((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true, autoClose: true }, (err, zipFile) => {
      if (err || !zipFile) return reject(err || new Error('Cannot open ZIP'));

      zipFile.on('entry', async (entry: yauzl.Entry) => {
        try {
          if (!entry.fileName.includes('_media/')) {
            zipFile.readEntry();
            return;
          }

          const mediaFile = entry.fileName.split('/').at(-1) ?? '';
          const rawAssetId = mediaFile.split('_')[0];
          if (!rawAssetId) { zipFile.readEntry(); return; }
          const safeId = rawAssetId.replace(/[^a-zA-Z0-9-]/g, '');
          if (!safeId) { zipFile.readEntry(); return; }

          const outputPath = path.join(mediaRoot, `restored-${safeId}`);
          await streamEntryToFile(zipFile, entry, outputPath);
          mediaRestored++;

          zipFile.readEntry();
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

  const counts = { conversationsRestored, messagesRestored, mediaRestored };
  await writeAuditLog({
    userId,
    action: AUDIT_ACTIONS.EXPORT_REQUESTED,
    entityType: 'conversation',
    metadata: { action: 'restore', ...counts },
  });
  return counts;
}

function parseConversationText(content: string): { contactName: string; phone: string; waId: string; messages: ParsedRestoreMessage[] } {
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

    const mediaMatch = line.match(/^MEDIA:\s*id=(.+?)\|filename=(.*?)\|mime=(.*?)\|status=(.*?)\|comprobante=(\d)\|size=(\d+)/);
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
