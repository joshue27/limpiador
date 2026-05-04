import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

import { prisma } from '@/lib/prisma';
import { getConfig } from '@/lib/config';
import { settingsFilePath } from '@/lib/settings-files';
import { uploadToDrive } from '@/modules/drive/uploader';
import { isDriveConfigured, type DriveSettings } from '@/modules/drive/settings';

async function getDriveConfig() {
  try {
    const data = await readFile(settingsFilePath('drive.json'), 'utf-8');
    return JSON.parse(data) as DriveSettings;
  } catch {
    return null;
  }
}

type ExportTrigger = 'daily' | 'manual';

type ExportWindow =
  | { mode: 'incremental'; from: string; to: string; fromDate: Date; toDate: Date }
  | { mode: 'full' };

type DriveExportPlan = {
  trigger: ExportTrigger;
  folderNames: string[];
  logPrefix: '[daily-export]' | '[manual-drive-backup]';
  uploadPrefix: string;
  window: ExportWindow;
};

export function buildDriveFolderNames(now: Date, trigger: ExportTrigger): string[] {
  const monthFolder = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  if (trigger === 'daily') {
    return [monthFolder];
  }

  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('-');
  const time = [
    String(now.getUTCHours()).padStart(2, '0'),
    String(now.getUTCMinutes()).padStart(2, '0'),
    String(now.getUTCSeconds()).padStart(2, '0'),
  ].join('');

  return [monthFolder, `manual-${stamp}-${time}`];
}

function today(now: Date): { from: string; to: string; fromDate: Date; toDate: Date } {
  const from = now.toISOString().slice(0, 10);
  const to = from;
  return {
    from, to,
    fromDate: new Date(`${from}T00:00:00.000Z`),
    toDate: new Date(`${to}T23:59:59.999Z`),
  };
}

function contactName(c: { displayName?: string | null; phone: string }) {
  return (c.displayName || c.phone).replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g, '').replace(/\s+/g, '').slice(0, 40);
}

function dateFormat(d: Date) {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy}-${hh}${min}`;
}

export function buildDriveExportPlan(now: Date, trigger: ExportTrigger): DriveExportPlan {
  if (trigger === 'manual') {
    return {
      trigger,
      folderNames: buildDriveFolderNames(now, trigger),
      logPrefix: '[manual-drive-backup]',
      uploadPrefix: 'manual-full',
      window: { mode: 'full' },
    };
  }

  return {
    trigger,
    folderNames: buildDriveFolderNames(now, trigger),
    logPrefix: '[daily-export]',
    uploadPrefix: '',
    window: { mode: 'incremental', ...today(now) },
  };
}

type ZipGenerationOptions = {
  window: ExportWindow;
  zipBasename: string;
};

async function generateMediaZip(mediaRoot: string, exportRoot: string, options: ZipGenerationOptions): Promise<string> {
  const assets = await prisma.mediaAsset.findMany({
    where: {
      isComprobante: true,
      ...(options.window.mode === 'incremental'
        ? { createdAt: { gte: options.window.fromDate, lte: options.window.toDate } }
        : {}),
    },
    include: { message: { include: { contact: { select: { displayName: true, phone: true } } } } },
  });
  if (assets.length === 0) return '';

  const zip = new JSZip();
  for (const a of assets) {
    if (a.storageKey) {
      try {
        const data = await readFile(path.join(mediaRoot, a.storageKey));
        const name = `${contactName(a.message.contact)}-${dateFormat(a.createdAt)}.${(a.filename || '').split('.').pop() || 'bin'}`;
        zip.file(name, data);
      } catch {}
    }
  }
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const filePath = path.join(exportRoot, `${options.zipBasename}.zip`);
  await writeFile(filePath, buf);
  return filePath;
}

type ConversationZipGenerationOptions = ZipGenerationOptions & {
  includeMediaFiles: boolean;
};

async function generateConversationZip(
  mediaRoot: string,
  exportRoot: string,
  options: ConversationZipGenerationOptions,
): Promise<string> {
  const conversations = await prisma.conversation.findMany({
    where: options.window.mode === 'incremental'
      ? { updatedAt: { gte: options.window.fromDate, lte: options.window.toDate } }
      : {},
    include: { contact: { select: { displayName: true, phone: true, waId: true, tags: true } }, assignedDepartment: { select: { name: true } } },
  });
  if (conversations.length === 0) return '';

  const zip = new JSZip();
  for (const conv of conversations) {
    const messages = await prisma.message.findMany({
      where: { conversationId: conv.id },
      include: { mediaAssets: true },
      orderBy: { createdAt: 'asc' },
    });
    const lines = [
      `Contacto: ${conv.contact.displayName || conv.contact.phone}`,
      `Teléfono: ${conv.contact.phone}`, `WA ID: ${conv.contact.waId}`,
      `Estado: ${conv.status}`, `Etiquetas: ${conv.contact.tags.join(', ')}`,
      `Depto: ${conv.assignedDepartment?.name || 'Sin asignar'}`,
      `Mensajes: ${messages.length}`, '',
    ];
    for (const m of messages) {
      const dir = m.direction === 'INBOUND' ? 'CLIENTE' : 'OPERADOR';
      const time = m.createdAt.toISOString().replace('T', ' ').slice(0, 19);
      const media = m.mediaAssets.length > 0 ? ` [${m.mediaAssets.map(a => a.filename || a.mimeType).join(', ')}]` : '';
      lines.push(`[${time}] ${dir} (${m.type}): ${m.body || m.caption || ''}${media}`);

      if (options.includeMediaFiles) {
        for (const asset of m.mediaAssets) {
          if (!asset.storageKey) continue;

          try {
            const data = await readFile(path.join(mediaRoot, asset.storageKey));
            const mediaFolder = `${contactName(conv.contact)}-${dateFormat(conv.updatedAt)}_media`;
            const mediaName = `${asset.id}_${asset.filename || 'file'}`;
            zip.file(`${mediaFolder}/${mediaName}`, data);
          } catch {}
        }
      }
    }
    zip.file(`${contactName(conv.contact)}-${dateFormat(conv.updatedAt)}.txt`, lines.join('\n'));
  }
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const filePath = path.join(exportRoot, `${options.zipBasename}.zip`);
  await writeFile(filePath, buf);
  return filePath;
}

async function generateContactCsv(exportRoot: string, options: ZipGenerationOptions): Promise<string> {
  const contacts = await prisma.contact.findMany({
    where: options.window.mode === 'incremental'
      ? { createdAt: { gte: options.window.fromDate, lte: options.window.toDate } }
      : {},
  });
  if (contacts.length === 0) return '';

  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = contacts.map(c => [c.phone, escape(c.displayName || ''), c.waId, escape(c.optInSource || ''), c.tags.join(';'), c.createdAt.toISOString()].join(','));
  const csv = ['phone,display_name,wa_id,opt_in_source,tags,created_at', ...rows].join('\n');
  const zip = new JSZip();
  zip.file('contactos.csv', csv);
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const filePath = path.join(exportRoot, `${options.zipBasename}.zip`);
  await writeFile(filePath, buf);
  return filePath;
}

async function generateChatCsv(exportRoot: string, options: ZipGenerationOptions): Promise<string> {
  const messages = await prisma.internalMessage.findMany({
    where: options.window.mode === 'incremental'
      ? { createdAt: { gte: options.window.fromDate, lte: options.window.toDate } }
      : {},
    include: { user: { select: { name: true, email: true } }, recipient: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  if (messages.length === 0) return '';

  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = messages.map(m => {
    const sender = m.user.name || m.user.email;
    const receiver = m.recipient ? (m.recipient.name || m.recipient.email) : 'General';
    return `${m.createdAt.toISOString()},${escape(sender)},${escape(receiver)},${escape(m.body)}`;
  });
  const csv = ['fecha,remitente,destinatario,mensaje', ...rows].join('\n');
  const zip = new JSZip();
  zip.file('chat-interno.csv', csv);
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const filePath = path.join(exportRoot, `${options.zipBasename}.zip`);
  await writeFile(filePath, buf);
  return filePath;
}

export async function runDailyExports(options: { trigger?: ExportTrigger } = {}) {
  const trigger = options.trigger ?? 'daily';
  const now = new Date();
  const plan = buildDriveExportPlan(now, trigger);
  const driveConfig = await getDriveConfig();
  if (!isDriveConfigured(driveConfig)) {
    console.log(`${plan.logPrefix} Google Drive not configured, skipping`);
    return;
  }

  const todayStr = now.toISOString().slice(0, 10);
  const exportRoot = getConfig().storage.exportRoot;
  const mediaRoot = getConfig().storage.mediaRoot;

  await mkdir(exportRoot, { recursive: true });

  const generators: Array<{ name: string; fn: () => Promise<string> }> = [
    {
      name: 'archivados',
      fn: () => generateMediaZip(mediaRoot, exportRoot, { window: plan.window, zipBasename: `${plan.uploadPrefix || 'daily'}-archivados` }),
    },
    {
      name: 'conversaciones',
      fn: () => generateConversationZip(mediaRoot, exportRoot, {
        window: plan.window,
        zipBasename: `${plan.uploadPrefix || 'daily'}-conversaciones`,
        includeMediaFiles: plan.trigger === 'manual',
      }),
    },
    {
      name: 'contactos',
      fn: () => generateContactCsv(exportRoot, { window: plan.window, zipBasename: `${plan.uploadPrefix || 'daily'}-contactos` }),
    },
    {
      name: 'chat-interno',
      fn: () => generateChatCsv(exportRoot, { window: plan.window, zipBasename: `${plan.uploadPrefix || 'daily'}-chat-interno` }),
    },
  ];

  for (const gen of generators) {
    try {
      const filePath = await gen.fn();
      if (!filePath) {
        console.log(`${plan.logPrefix} No data to upload for ${gen.name} (${plan.window.mode})`);
        continue;
      }

      const remoteFileName = plan.uploadPrefix
        ? `${plan.uploadPrefix}-${gen.name}-${todayStr}.zip`
        : `${gen.name}-${todayStr}.zip`;

      await uploadToDrive(
        {
          clientId: driveConfig.clientId,
          clientSecret: driveConfig.clientSecret,
          refreshToken: driveConfig.refreshToken,
          folderId: driveConfig.folderId || 'root',
        },
        filePath,
        remoteFileName,
        plan.folderNames,
      );
      console.log(`${plan.logPrefix} Uploaded ${gen.name} to Drive (${plan.window.mode})`);
    } catch (err) {
      console.error(`${plan.logPrefix} Failed ${gen.name}:`, err instanceof Error ? err.message : err);
    }
  }
}
