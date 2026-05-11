import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

import { getConfig } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import { markRestoreRunFailed, markRestoreRunReady, markRestoreRunRunning, type RestoreCounts } from '@/modules/restore/restore-job';

class RestoreZipLimitError extends Error {}

const MAX_RESTORE_DECOMPRESSED_BYTES = 500 * 1024 * 1024;
const MAX_RESTORE_ENTRY_BYTES = 50 * 1024 * 1024;

function cleanPhone(value: string) {
  return value.replace(/[\s().\-+]/g, '').trim();
}

type ParsedRestoreMessage = {
  time: string;
  direction: 'INBOUND' | 'OUTBOUND';
  type: string;
  body: string;
  media?: Array<{ id: string; filename: string; mime: string; status: string; comprobante: boolean; size: number }>;
};

export async function processRestoreRun(input: { restoreRunId: string; archivePath: string; userId: string }): Promise<RestoreCounts> {
  await markRestoreRunRunning(prisma, input.restoreRunId);

  try {
    const buffer = await readFile(input.archivePath);
    const result = await restoreArchiveBuffer(buffer, input.userId);
    await markRestoreRunReady(prisma, input.restoreRunId, result);
    return result;
  } catch (error) {
    await markRestoreRunFailed(prisma, input.restoreRunId, error);
    throw error;
  } finally {
    await rm(input.archivePath, { force: true }).catch(() => undefined);
  }
}

export async function restoreArchiveBuffer(buffer: Buffer, userId: string): Promise<RestoreCounts> {
  const zip = await JSZip.loadAsync(buffer);
  const restorableEntries = Object.entries(zip.files).filter(([, zipEntry]) => !zipEntry.dir);
  let extractedBytes = 0;
  const textContents = new Map<string, string>();
  const mediaContents = new Map<string, Buffer>();

  for (const [filename, zipEntry] of restorableEntries) {
    if (!filename.endsWith('.txt') && !filename.includes('_media/')) continue;

    if (filename.endsWith('.txt')) {
      const content = await zipEntry.async('string');
      extractedBytes = assertRestoreEntrySize(Buffer.byteLength(content, 'utf8'), extractedBytes);
      textContents.set(filename, content);
      continue;
    }

    const data = await zipEntry.async('nodebuffer');
    extractedBytes = assertRestoreEntrySize(data.byteLength, extractedBytes);
    mediaContents.set(filename, data);
  }

  let conversationsRestored = 0;
  let messagesRestored = 0;

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

      for (const asset of msg.media ?? []) {
        await prisma.mediaAsset.create({
          data: {
            id: asset.id,
            messageId: restored.id,
            waMediaId: `restored-${asset.id}`,
            mimeType: asset.mime,
            filename: asset.filename || null,
            size: asset.size,
            downloadStatus: asset.status === 'READY' || asset.status === 'PENDING' || asset.status === 'FAILED' ? asset.status : 'PENDING',
            isComprobante: asset.comprobante,
            storageKey: `restored-${asset.id}`,
          },
        }).catch(() => undefined);
      }
    }
  }

  const mediaRoot = getConfig().storage.mediaRoot;
  let mediaRestored = 0;
  await mkdir(mediaRoot, { recursive: true });
  for (const [zipPath, data] of mediaContents) {
    const mediaFile = zipPath.split('/').at(-1) ?? '';
    const assetId = mediaFile.split('_')[0];
    if (!assetId) continue;
    await writeFile(path.join(mediaRoot, `restored-${assetId}`), data);
    mediaRestored++;
  }

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

function assertRestoreEntrySize(entryBytes: number, currentTotalBytes: number): number {
  if (entryBytes > MAX_RESTORE_ENTRY_BYTES) throw new RestoreZipLimitError('Un archivo del ZIP excede el tamaño máximo permitido.');
  const nextTotalBytes = currentTotalBytes + entryBytes;
  if (nextTotalBytes > MAX_RESTORE_DECOMPRESSED_BYTES) throw new RestoreZipLimitError('El contenido descomprimido del ZIP excede el tamaño máximo permitido.');
  return nextTotalBytes;
}
