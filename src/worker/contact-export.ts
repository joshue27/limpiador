import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

export async function generateContactExport(
  prisma: { contact: { findMany: Function }; exportRun: { update: Function } },
  exportRoot: string,
  exportRunId: string,
  from: string,
  to: string,
) {
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);

  const contacts = await prisma.contact.findMany({
    where: {
      createdAt: { gte: fromDate, lte: toDate },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (contacts.length === 0) {
    await prisma.exportRun.update({
      where: { id: exportRunId },
      data: { status: 'FAILED', completedAt: new Date(), countsJson: { total: 0, error: 'No hay contactos en este rango.' } },
    });
    return { total: 0 };
  }

  // Build CSV
  const header = 'phone,display_name,wa_id,opt_in_source,tags,unsubscribed,blocked,last_inbound_at,created_at';
  const rows = contacts.map((c: { phone: string; displayName?: string | null; waId: string; optInSource?: string | null; tags: string[]; unsubscribed: boolean; blocked: boolean; lastInboundAt?: Date | null; createdAt: Date }) => {
    const escape = (v: string) => `"${(v || '').replace(/"/g, '""')}"`;
    return [
      c.phone,
      escape(c.displayName || ''),
      c.waId,
      escape(c.optInSource || ''),
      c.tags.join(';'),
      c.unsubscribed ? 'true' : 'false',
      c.blocked ? 'true' : 'false',
      c.lastInboundAt?.toISOString() || '',
      c.createdAt.toISOString(),
    ].join(',');
  });

  const csv = [header, ...rows].join('\n');

  const zip = new JSZip();
  zip.file('contactos.csv', csv);

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
      countsJson: { total: contacts.length, size: zipBuffer.length },
    },
  });

  return { total: contacts.length, size: zipBuffer.length };
}