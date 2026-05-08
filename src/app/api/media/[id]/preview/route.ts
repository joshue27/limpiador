import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

import { NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import { auditDeniedAccess, getVerifiedSession } from '@/modules/auth/guards';
import { auditConversationAccessDenied, canViewConversation } from '@/modules/inbox/access';
import { isSafeInlineMediaPreviewMime, normalizeMimeType } from '@/modules/media/storage';

export const runtime = 'nodejs';

function privateMediaPath(root: string, storageKey: string) {
  const rootPath = path.resolve(root);
  const filePath = path.resolve(rootPath, storageKey);
  const relativePath = path.relative(rootPath, filePath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }

  return filePath;
}

function parseRange(rangeHeader: string | null, size: number) {
  if (!rangeHeader) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) return 'invalid' as const;

  const [, startValue, endValue] = match;
  const start = startValue ? Number.parseInt(startValue, 10) : 0;
  const end = endValue ? Number.parseInt(endValue, 10) : size - 1;

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) {
    return 'invalid' as const;
  }

  return { start, end: Math.min(end, size - 1) };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getVerifiedSession();

  if (!session) {
    await auditDeniedAccess({ request, session, entityType: 'media_asset', entityId: id, reason: 'unauthenticated' });
    return NextResponse.json({ error: 'No tiene permiso para ver este archivo.' }, { status: 401 });
  }

  const asset = await prisma.mediaAsset.findUnique({
    where: { id },
    include: { message: { select: { conversationId: true } } },
  });

  if (!asset?.storageKey || asset.downloadStatus !== 'READY') {
    return NextResponse.json({ error: 'El archivo todavía no está disponible.' }, { status: 404 });
  }

  if (!(await canViewConversation(session, asset.message.conversationId))) {
    await auditConversationAccessDenied({
      session,
      conversationId: asset.message.conversationId,
      reason: 'media_preview_forbidden',
    });
    return NextResponse.json({ error: 'No tiene permiso para ver este archivo.' }, { status: 403 });
  }

  const filePath = privateMediaPath(getConfig().storage.mediaRoot, asset.storageKey);
  if (!filePath) return new Response('Forbidden', { status: 403 });

  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile()) {
    return NextResponse.json({ error: 'El archivo no está disponible.' }, { status: 404 });
  }

  const range = parseRange(request.headers.get('range'), fileStat.size);
  const normalizedMimeType = normalizeMimeType(asset.mimeType);
  const safeInlinePreview = isSafeInlineMediaPreviewMime(normalizedMimeType);
  const safeFilename = (asset.filename ?? `${asset.waMediaId}.bin`).replace(/[^\x20-\x7E]/g, '_').replaceAll('"', '');
  const baseHeaders = {
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=60',
    'Content-Type': normalizedMimeType || 'application/octet-stream',
    'Content-Disposition': safeInlinePreview ? 'inline' : `attachment; filename="${safeFilename}"`,
    'X-Content-Type-Options': 'nosniff',
  };

  if (range === 'invalid') {
    return new Response('Invalid range', {
      status: 416,
      headers: { ...baseHeaders, 'Content-Range': `bytes */${fileStat.size}` },
    });
  }

  if (range) {
    const stream = Readable.toWeb(createReadStream(filePath, { start: range.start, end: range.end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Length': String(range.end - range.start + 1),
        'Content-Range': `bytes ${range.start}-${range.end}/${fileStat.size}`,
      },
    });
  }

  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new Response(stream, {
    headers: {
      ...baseHeaders,
      'Content-Length': String(fileStat.size),
    },
  });
}
