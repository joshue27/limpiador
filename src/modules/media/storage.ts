import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isSafeInlineMediaPreviewMime, normalizeMimeType } from '@/modules/media/mime';

const ALLOWED_MEDIA_MIME_PREFIXES = ['image/', 'audio/', 'video/'];
const ALLOWED_MEDIA_EXACT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]);

function sanitizeFilename(filename: string) {
  const trimmed = filename.trim();
  const basename = path.posix.basename(trimmed).replace(/[\x00-\x1f\x7f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  return basename || 'file.bin';
}

function ensureSafeStorageKey(storageKey: string) {
  const normalized = storageKey.replaceAll('\\', '/');
  const segments = normalized.split('/');

  if (
    !normalized ||
    path.posix.isAbsolute(normalized) ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error('Invalid storage key');
  }

  return normalized;
}

export function isAllowedMediaMime(mimeType: string | null | undefined) {
  const normalized = normalizeMimeType(mimeType);
  return ALLOWED_MEDIA_MIME_PREFIXES.some((prefix) => normalized.startsWith(prefix))
    || ALLOWED_MEDIA_EXACT_MIME_TYPES.has(normalized);
}

export function sha256Hex(bytes: ArrayBuffer | ArrayBufferView) {
  const buffer = Buffer.isBuffer(bytes)
    ? bytes
    : Buffer.from(bytes instanceof ArrayBuffer ? bytes : bytes.buffer, bytes instanceof ArrayBuffer ? undefined : bytes.byteOffset, bytes instanceof ArrayBuffer ? undefined : bytes.byteLength);

  return createHash('sha256').update(buffer).digest('hex');
}

export function safeMediaStorageKey(id: string | null | undefined, filename: string) {
  const safeId = (id?.trim() || randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '');
  return ensureSafeStorageKey(`${safeId}/${sanitizeFilename(filename)}`);
}

export async function writePrivateMedia(root: string, storageKey: string, bytes: Uint8Array | Buffer) {
  const safeKey = ensureSafeStorageKey(storageKey);
  const rootPath = path.resolve(root);
  const targetPath = path.resolve(rootPath, safeKey);
  const relativePath = path.relative(rootPath, targetPath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('Invalid private media path');
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, bytes);
  return targetPath;
}

export { isSafeInlineMediaPreviewMime, normalizeMimeType };
