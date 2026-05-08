const SAFE_INLINE_MEDIA_PREVIEW_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'application/pdf',
]);

const MIME_TYPE_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'audio/mp3': 'audio/mpeg',
};

export function normalizeMimeType(mimeType: string | null | undefined) {
  const normalized = mimeType?.trim().toLowerCase() ?? '';
  if (!normalized) return 'application/octet-stream';
  return MIME_TYPE_ALIASES[normalized] ?? normalized;
}

export function isSafeInlineMediaPreviewMime(mimeType: string | null | undefined) {
  return SAFE_INLINE_MEDIA_PREVIEW_MIME_TYPES.has(normalizeMimeType(mimeType));
}
