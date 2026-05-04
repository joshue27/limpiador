import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

export async function generateExportZip(
  prisma: { mediaAsset: { findMany: Function }; exportRun: { update: Function } },
  mediaRoot: string,
  exportRoot: string,
  exportRunId: string,
  from: string,
  to: string,
) {
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);

  const assets = await prisma.mediaAsset.findMany({
    where: {
      isComprobante: true,
      createdAt: { gte: fromDate, lte: toDate },
    },
    include: {
      message: { include: { contact: { select: { displayName: true, phone: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (assets.length === 0) {
    await prisma.exportRun.update({
      where: { id: exportRunId },
      data: { status: 'FAILED', completedAt: new Date(), countsJson: { total: 0, size: 0, error: 'No hay archivos archivados en este rango de fechas.' } },
    });
    return { total: 0 };
  }

  const zip = new JSZip();
  let totalSize = 0;

  for (const asset of assets) {
    const contactName = (asset.message.contact.displayName || asset.message.contact.phone)
      .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g, '')
      .replace(/\s+/g, '')
      .slice(0, 40);
    const date = asset.createdAt;
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = date.getUTCFullYear();
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const min = String(date.getUTCMinutes()).padStart(2, '0');
    const ext = (asset.filename || '').split('.').pop() || asset.mimeType.split('/')[1] || 'bin';
    const safeName = `${contactName}-${dd}-${mm}-${yyyy}-${hh}${min}.${ext}`;

    if (asset.storageKey) {
      try {
        const filePath = path.join(mediaRoot, asset.storageKey);
        const data = await readFile(filePath);
        zip.file(safeName, data);
        totalSize += data.length;
      } catch {
        // File not found on disk, skip
      }
    }
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
      countsJson: { total: assets.length, size: zipBuffer.length },
    },
  });

  return { total: assets.length, size: zipBuffer.length };
}
