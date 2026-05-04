import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

export async function generateChatExport(
  prisma: { internalMessage: { findMany: Function }; exportRun: { update: Function } },
  exportRoot: string,
  exportRunId: string,
  from: string,
  to: string,
) {
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);

  const messages = await prisma.internalMessage.findMany({
    where: { createdAt: { gte: fromDate, lte: toDate } },
    include: { user: { select: { name: true, email: true } }, recipient: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });

  if (messages.length === 0) {
    await prisma.exportRun.update({
      where: { id: exportRunId },
      data: { status: 'FAILED', completedAt: new Date(), countsJson: { total: 0, error: 'No hay mensajes de chat en este rango.' } },
    });
    return { total: 0 };
  }

  // Build CSV
  const header = 'fecha,remitente,destinatario,mensaje';
  const rows = messages.map((m: { createdAt: Date; user: { name?: string | null; email: string }; recipient?: { name?: string | null; email: string } | null; body: string }) => {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const sender = m.user.name || m.user.email;
    const receiver = m.recipient ? (m.recipient.name || m.recipient.email) : 'General';
    return `${m.createdAt.toISOString()},${escape(sender)},${escape(receiver)},${escape(m.body)}`;
  });

  const csv = [header, ...rows].join('\n');
  const zip = new JSZip();
  zip.file('chat-interno.csv', csv);
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  const zipKey = `export-${exportRunId}.zip`;
  await mkdir(exportRoot, { recursive: true });
  await writeFile(path.join(exportRoot, zipKey), zipBuffer);

  await prisma.exportRun.update({
    where: { id: exportRunId },
    data: { status: 'READY', zipKey, completedAt: new Date(), countsJson: { total: messages.length, size: zipBuffer.length } },
  });

  return { total: messages.length, size: zipBuffer.length };
}
