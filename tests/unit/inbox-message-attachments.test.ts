import { describe, expect, it } from 'vitest';

import { getConversationMessageAttachmentPreviews } from '@/modules/inbox/message-attachments';

describe('getConversationMessageAttachmentPreviews', () => {
  it('expone una preview inline compacta para imágenes listas', () => {
    const previews = getConversationMessageAttachmentPreviews({
      type: 'IMAGE',
      caption: 'Foto del frente',
      mediaAssets: [
        {
          id: 'asset-image-1',
          filename: 'frente.png',
          mimeType: 'image/png',
          size: null,
          downloadStatus: 'READY',
          isComprobante: false,
        },
      ],
    });

    expect(previews).toEqual([
      {
        kind: 'image',
        key: 'asset-image-1',
        src: '/api/media/asset-image-1/preview',
        href: '/api/media/asset-image-1/preview',
        downloadHref: '/api/media/asset-image-1/download',
        alt: 'Foto del frente',
        label: 'frente.png',
        size: null,
        isComprobante: false,
      },
    ]);
  });

  it('cae en link compacto cuando la imagen todavía no está lista para descarga', () => {
    const previews = getConversationMessageAttachmentPreviews({
      type: 'IMAGE',
      caption: null,
      mediaAssets: [
        {
          id: 'asset-image-2',
          filename: 'detalle.webp',
          mimeType: 'image/webp',
          size: null,
          downloadStatus: 'PENDING',
          isComprobante: false,
        },
      ],
    });

    expect(previews).toEqual([
      {
        kind: 'link',
        key: 'asset-image-2',
        href: '/comprobantes#asset-image-2',
        label: 'Adjunto en procesamiento: detalle.webp',
        size: null,
        isComprobante: false,
      },
    ]);
  });

  it('mantiene el comportamiento compacto de documentos con link al detalle', () => {
    const previews = getConversationMessageAttachmentPreviews({
      type: 'DOCUMENT',
      caption: 'Factura abril',
      mediaAssets: [
        {
          id: 'asset-document-1',
          filename: 'factura.pdf',
          mimeType: 'application/pdf',
          size: null,
          downloadStatus: 'READY',
          isComprobante: false,
        },
      ],
    });

    expect(previews).toEqual([
      {
        kind: 'link',
        key: 'asset-document-1',
        href: '/api/media/asset-document-1/download',
        label: 'Adjunto: factura.pdf',
        size: null,
        isComprobante: false,
      },
    ]);
  });

  it('mantiene el comportamiento compacto de documentos con link al detalle para assets no listos', () => {
    const previews = getConversationMessageAttachmentPreviews({
      type: 'DOCUMENT',
      caption: 'Factura abril',
      mediaAssets: [
        {
          id: 'asset-document-1',
          filename: 'factura.pdf',
          mimeType: 'application/pdf',
          size: null,
          downloadStatus: 'PENDING',
          isComprobante: false,
        },
      ],
    });

    expect(previews).toEqual([
      {
        kind: 'link',
        key: 'asset-document-1',
        href: '/comprobantes#asset-document-1',
        label: 'Adjunto en procesamiento: factura.pdf',
        size: null,
        isComprobante: false,
      },
    ]);
  });
});
