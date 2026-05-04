import { readdir, readFile, unlink, rmdir } from 'node:fs/promises';
import path from 'node:path';

import { prisma } from '@/lib/prisma';
import { getConfig } from '@/lib/config';
import { settingsFilePath } from '@/lib/settings-files';

async function getRetentionConfig(): Promise<{ exportsDays: number; auditDays: number; mediaDays: number; chatDays: number; conversationsDays: number; orphanedCleanup: boolean }> {
  try {
    const data = await readFile(settingsFilePath('retention.json'), 'utf-8');
    const config = JSON.parse(data);
    return {
      exportsDays: Number(config.exportsDays || 30),
      auditDays: Number(config.auditDays || 90),
      mediaDays: Number(config.mediaDays || 60),
      chatDays: Number(config.chatDays || 30),
      conversationsDays: Number(config.conversationsDays || 90),
      orphanedCleanup: config.orphanedCleanup !== 'false',
    };
  } catch {
    return { exportsDays: 30, auditDays: 90, mediaDays: 60, chatDays: 30, conversationsDays: 90, orphanedCleanup: true };
  }
}

export async function runRetentionCleanup() {
  const config = await getRetentionConfig();
  const now = new Date();
  let deleted = { exports: 0, audit: 0, media: 0, chat: 0, conversations: 0, orphaned: 0, dirs: 0 };

  // Clean export ZIP files
  if (config.exportsDays > 0) {
    const cutoff = new Date(now.getTime() - config.exportsDays * 24 * 60 * 60 * 1000);
    const oldExports = await prisma.exportRun.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true, zipKey: true },
    });
    const exportRoot = getConfig().storage.exportRoot;
    for (const exp of oldExports) {
      if (exp.zipKey) {
        await unlink(path.join(exportRoot, exp.zipKey)).catch(() => {});
      }
      await prisma.exportRun.delete({ where: { id: exp.id } }).catch(() => {});
      deleted.exports++;
    }
  }

  // Clean audit logs
  if (config.auditDays > 0) {
    const cutoff = new Date(now.getTime() - config.auditDays * 24 * 60 * 60 * 1000);
    const result = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    deleted.audit = result.count;
  }

  // Clean old media files (not marked as archived)
  if (config.mediaDays > 0) {
    const cutoff = new Date(now.getTime() - config.mediaDays * 24 * 60 * 60 * 1000);
    const oldMedia = await prisma.mediaAsset.findMany({
      where: { createdAt: { lt: cutoff }, isComprobante: false },
      select: { id: true, storageKey: true },
    });
    const mediaRoot = getConfig().storage.mediaRoot;
    for (const m of oldMedia) {
      if (m.storageKey) {
        await unlink(path.join(mediaRoot, m.storageKey)).catch(() => {});
      }
      await prisma.mediaAsset.delete({ where: { id: m.id } }).catch(() => {});
      deleted.media++;
    }
  }

  // Clean old chat messages
  if (config.chatDays > 0) {
    const cutoff = new Date(now.getTime() - config.chatDays * 24 * 60 * 60 * 1000);
    const result = await prisma.internalMessage.deleteMany({ where: { createdAt: { lt: cutoff } } });
    deleted.chat = result.count;
  }

  // Clean old conversations (inbox)
  if (config.conversationsDays > 0) {
    const cutoff = new Date(now.getTime() - config.conversationsDays * 24 * 60 * 60 * 1000);
    // Get media assets to clean files from disk first
    const oldConversations = await prisma.conversation.findMany({
      where: { updatedAt: { lt: cutoff } },
      select: { id: true },
    });
    if (oldConversations.length > 0) {
      const ids = oldConversations.map(c => c.id);
      // Delete media files from disk
      const mediaAssets = await prisma.mediaAsset.findMany({
        where: { message: { conversationId: { in: ids } } },
        select: { storageKey: true },
      });
      const mediaRoot = getConfig().storage.mediaRoot;
      for (const m of mediaAssets) {
        if (m.storageKey) {
          await unlink(path.join(mediaRoot, m.storageKey)).catch(() => {});
        }
      }
      // Delete conversations (cascades messages + media assets)
      await prisma.conversation.deleteMany({ where: { id: { in: ids } } });
      deleted.conversations = oldConversations.length;
    }
  }

  // Clean orphaned files (on disk but not in DB)
  if (config.orphanedCleanup) {
    const mediaRoot = getConfig().storage.mediaRoot;
    try {
      const files = await readdir(mediaRoot);
      const dbFiles = new Set(
        (await prisma.mediaAsset.findMany({ select: { storageKey: true } }))
          .map(m => m.storageKey)
          .filter(Boolean) as string[],
      );
      for (const file of files) {
        if (!dbFiles.has(file) && !file.startsWith('.')) {
          await unlink(path.join(mediaRoot, file)).catch(() => {});
          deleted.orphaned++;
        }
      }
    } catch {}

    // Clean empty export directories
    const exportRoot = getConfig().storage.exportRoot;
    try {
      const entries = await readdir(exportRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subFiles = await readdir(path.join(exportRoot, entry.name));
          if (subFiles.length === 0) {
            await rmdir(path.join(exportRoot, entry.name)).catch(() => {});
            deleted.dirs++;
          }
        }
      }
    } catch {}
  }

  console.log(`[retention] Deleted: ${deleted.exports} exports, ${deleted.audit} audit logs, ${deleted.media} media, ${deleted.chat} chat msgs, ${deleted.conversations} conversations, ${deleted.orphaned} orphaned files, ${deleted.dirs} empty dirs`);
  return deleted;
}
