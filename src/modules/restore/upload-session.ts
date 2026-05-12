import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SESSION_ROOT = 'restore-uploads/chunks';
const UPLOAD_ID_PATTERN = /^[a-f0-9-]+$/i;

export type RestoreUploadManifest = {
  id: string;
  fileName: string;
  fileSize: number;
  chunkCount: number;
};

export function restoreUploadSessionDir(exportRoot: string, uploadId: string) {
  assertUploadId(uploadId);
  return path.join(exportRoot, SESSION_ROOT, uploadId);
}

export function restoreUploadPartsDir(exportRoot: string, uploadId: string) {
  return path.join(restoreUploadSessionDir(exportRoot, uploadId), 'parts');
}

function restoreUploadManifestPath(exportRoot: string, uploadId: string) {
  return path.join(restoreUploadSessionDir(exportRoot, uploadId), 'manifest.json');
}

function assertUploadId(uploadId: string) {
  if (!UPLOAD_ID_PATTERN.test(uploadId)) {
    throw new Error('Restore upload id inválido.');
  }
}

export async function createRestoreUploadSession(input: {
  exportRoot: string;
  fileName: string;
  fileSize: number;
  chunkCount: number;
}): Promise<RestoreUploadManifest> {
  const manifest: RestoreUploadManifest = {
    id: randomUUID(),
    fileName: input.fileName || 'restore.zip',
    fileSize: input.fileSize,
    chunkCount: input.chunkCount,
  };

  const partsDir = restoreUploadPartsDir(input.exportRoot, manifest.id);
  await mkdir(partsDir, { recursive: true });
  await writeFile(
    restoreUploadManifestPath(input.exportRoot, manifest.id),
    JSON.stringify(manifest),
    {
      flag: 'wx',
    },
  );

  return manifest;
}

export async function readRestoreUploadSession(
  exportRoot: string,
  uploadId: string,
): Promise<RestoreUploadManifest> {
  assertUploadId(uploadId);
  const raw = await readFile(restoreUploadManifestPath(exportRoot, uploadId), 'utf8');
  return JSON.parse(raw) as RestoreUploadManifest;
}

export async function storeRestoreUploadChunk(input: {
  exportRoot: string;
  uploadId: string;
  chunkIndex: number;
  data: Buffer;
}) {
  const manifest = await readRestoreUploadSession(input.exportRoot, input.uploadId);
  if (input.chunkIndex < 0 || input.chunkIndex >= manifest.chunkCount) {
    throw new Error('Chunk fuera de rango.');
  }

  const uploadedBytes = await getStoredChunkBytes(
    input.exportRoot,
    input.uploadId,
    input.chunkIndex,
  );
  if (uploadedBytes + input.data.length > manifest.fileSize) {
    throw new Error('La subida excede el tamaño esperado del ZIP.');
  }

  const partPath = path.join(
    restoreUploadPartsDir(input.exportRoot, input.uploadId),
    `${input.chunkIndex}.part`,
  );
  await writeFile(partPath, input.data);
  return { receivedBytes: input.data.length };
}

async function getStoredChunkBytes(
  exportRoot: string,
  uploadId: string,
  excludeChunkIndex?: number,
) {
  const partsDir = restoreUploadPartsDir(exportRoot, uploadId);
  const partNames = await readdir(partsDir).catch(() => [] as string[]);

  let total = 0;
  for (const partName of partNames) {
    if (!partName.endsWith('.part')) continue;
    if (excludeChunkIndex !== undefined && partName === `${excludeChunkIndex}.part`) continue;
    const partPath = path.join(partsDir, partName);
    const partStat = await stat(partPath).catch(() => null);
    if (partStat?.isFile()) {
      total += partStat.size;
    }
  }

  return total;
}

export async function assembleRestoreUpload(input: {
  exportRoot: string;
  uploadId: string;
}): Promise<{ archivePath: string; fileName: string; fileSize: number }> {
  const manifest = await readRestoreUploadSession(input.exportRoot, input.uploadId);
  const uploadDir = path.join(input.exportRoot, 'restore-uploads');
  const archivePath = path.join(uploadDir, `${manifest.id}.zip`);
  await mkdir(uploadDir, { recursive: true });
  await writeFile(archivePath, new Uint8Array(), { flag: 'wx' });

  let totalBytes = 0;
  try {
    for (let index = 0; index < manifest.chunkCount; index += 1) {
      const partPath = path.join(
        restoreUploadPartsDir(input.exportRoot, manifest.id),
        `${index}.part`,
      );
      const chunk = await readFile(partPath);
      totalBytes += chunk.length;
      await appendFile(archivePath, chunk);
    }

    if (totalBytes !== manifest.fileSize) {
      throw new Error('El archivo subido quedó incompleto al ensamblarse.');
    }

    await rm(restoreUploadSessionDir(input.exportRoot, manifest.id), {
      recursive: true,
      force: true,
    }).catch(() => undefined);

    return {
      archivePath,
      fileName: manifest.fileName,
      fileSize: totalBytes,
    };
  } catch (error) {
    await rm(archivePath, { force: true }).catch(() => undefined);
    throw error;
  }
}
