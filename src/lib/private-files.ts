import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

const invalidPrivatePathMessage = 'Invalid private file path';

function assertStorageKeyIsSafe(storageKey: string) {
  let decodedKey: string;
  try {
    decodedKey = decodeURIComponent(storageKey);
  } catch {
    throw new Error(invalidPrivatePathMessage);
  }

  if (
    decodedKey.includes('\0') ||
    decodedKey.includes('\\') ||
    path.isAbsolute(decodedKey) ||
    path.posix.isAbsolute(decodedKey) ||
    path.win32.isAbsolute(decodedKey)
  ) {
    throw new Error(invalidPrivatePathMessage);
  }

  const segments = decodedKey.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(invalidPrivatePathMessage);
  }

  return decodedKey;
}

function assertContained(rootPath: string, candidatePath: string) {
  const relativePath = path.relative(rootPath, candidatePath);
  if (relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))) {
    return;
  }

  throw new Error(invalidPrivatePathMessage);
}

async function realpathNearestExisting(targetPath: string) {
  let current = targetPath;

  while (current !== path.dirname(current)) {
    const currentStat = await stat(current).catch(() => null);
    if (currentStat) return realpath(current);
    current = path.dirname(current);
  }

  return realpath(current);
}

export async function resolvePrivatePath(root: string, storageKey: string) {
  const rootPath = await realpath(path.resolve(root));
  const decodedKey = assertStorageKeyIsSafe(storageKey);
  const filePath = path.resolve(rootPath, decodedKey);

  assertContained(rootPath, filePath);

  const canonicalExistingPath = await realpathNearestExisting(filePath);
  assertContained(rootPath, canonicalExistingPath);

  return filePath;
}

export async function privateFileResponse(root: string, storageKey: string, filename: string, contentType = 'application/octet-stream') {
  const filePath = await resolvePrivatePath(root, storageKey).catch(() => null);
  if (!filePath) {
    return new Response('Forbidden', { status: 403 });
  }

  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile()) {
    return new Response('File is not available', { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new Response(stream, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(fileStat.size),
      'Content-Disposition': `attachment; filename="${filename.replace(/[^\x20-\x7E]/g, '_').replaceAll('"', '')}"`,
    },
  });
}
