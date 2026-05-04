import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

export async function generateConversationExport(
  prisma: { conversation: { findMany: Function }; message: { findMany: Function }; exportRun: { update: Function } },
  mediaRoot: string,
  exportRoot: string,
  exportRunId: string,
  from: string,
  to: string,
) {
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);

  const conversations = await prisma.conversation.findMany({
    where: {
      updatedAt: { gte: fromDate, lte: toDate },
    },
    include: {
      contact: { select: { displayName: true, phone: true, waId: true } },
      assignedDepartment: { select: { name: true } },
      assignedTo: { select: { email: true } },
    },
    orderBy: { updatedAt: 'asc' },
  });

  if (conversations.length === 0) {
    await prisma.exportRun.update({
      where: { id: exportRunId },
      data: { status: 'FAILED', completedAt: new Date(), countsJson: { total: 0, size: 0, error: 'No hay conversaciones en este rango de fechas.' } },
    });
    return { total: 0 };
  }

  const zip = new JSZip();
  let totalSize = 0;

  for (const conv of conversations) {
    const contactName = (conv.contact.displayName || conv.contact.phone)
      .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g, '')
      .replace(/\s+/g, '')
      .slice(0, 40);

    // Format date from lastMessageAt or updatedAt
    const lastDate = conv.lastMessageAt || conv.updatedAt;
    const dd = String(lastDate.getUTCDate()).padStart(2, '0');
    const mm = String(lastDate.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = lastDate.getUTCFullYear();
    const hh = String(lastDate.getUTCHours()).padStart(2, '0');
    const min = String(lastDate.getUTCMinutes()).padStart(2, '0');
    const safeName = `${contactName}-${dd}-${mm}-${yyyy}-${hh}${min}.txt`;

    // Fetch all messages for this conversation
    const messages = await prisma.message.findMany({
      where: { conversationId: conv.id },
      include: { mediaAssets: true },
      orderBy: { createdAt: 'asc' },
    });

    // Build conversation text
    const lines: string[] = [
      `=== Conversación ===`,
      `Contacto: ${conv.contact.displayName || conv.contact.phone}`,
      `Teléfono: ${conv.contact.phone}`,
      `WA ID: ${conv.contact.waId}`,
      `Estado: ${conv.status}`,
      `Departamento: ${conv.assignedDepartment?.name || 'Sin asignar'}`,
      `Asignado a: ${conv.assignedTo?.email || 'Sin asignar'}`,
      `Mensajes: ${messages.length}`,
      `No leídos: ${conv.unreadCount}`,
      `Último mensaje: ${lastDate.toISOString()}`,
      ``,
    ];

    for (const msg of messages) {
      const direction = msg.direction === 'INBOUND' ? 'CLIENTE' : 'OPERADOR';
      const time = msg.createdAt.toISOString().replace('T', ' ').slice(0, 19);
      const type = msg.type;
      const body = msg.body || msg.caption || '';
      const mediaInfo = msg.mediaAssets.length > 0
        ? ` [${msg.mediaAssets.map((a: { filename?: string | null; mimeType?: string }) => a.filename || a.mimeType || '').join(', ')}]`
        : '';

      lines.push(`[${time}] ${direction} (${type}): ${body}${mediaInfo}`);

      // Include media metadata for restore
      for (const asset of msg.mediaAssets) {
        const a = asset as { id: string; filename?: string | null; mimeType?: string; downloadStatus?: string; isComprobante?: boolean; size?: number | null };
        lines.push(`MEDIA: id=${a.id}|filename=${a.filename || ''}|mime=${a.mimeType || ''}|status=${a.downloadStatus || 'READY'}|comprobante=${a.isComprobante ? '1' : '0'}|size=${a.size ?? 0}`);
      }

      // Include media binary files in ZIP
      for (const asset of msg.mediaAssets) {
        if (asset.storageKey && (asset as { id: string }).id) {
          try {
            const filePath = path.join(mediaRoot, asset.storageKey);
            const data = await readFile(filePath);
            const mediaFolder = `${safeName.replace('.txt', '')}_media`;
            const mediaName = (asset as { id: string }).id + '_' + ((asset as { filename?: string | null }).filename || 'file');
            zip.file(`${mediaFolder}/${mediaName}`, data);
            totalSize += data.length;
          } catch {
            // File not on disk, skip
          }
        }
      }
    }

    const content = lines.join('\n');
    zip.file(safeName, content);
    totalSize += content.length;
  }

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  const zipKey = `export-${exportRunId}.zip`;
  await mkdir(exportRoot, { recursive: true });
  await writeFile(path.join(exportRoot, zipKey), zipBuffer);

  await prisma.exportRun.update({
    where: { id: exportRunId },
    data: {
      status: 'READY',
      zipKey,
      completedAt: new Date(),
      countsJson: { total: conversations.length, size: zipBuffer.length },
    },
  });

  return { total: conversations.length, size: zipBuffer.length };
}
