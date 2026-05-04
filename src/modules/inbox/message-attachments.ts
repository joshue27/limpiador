type ConversationMessageAttachmentAsset = {
  id: string;
  filename: string | null;
  mimeType: string;
  size: number | null;
  downloadStatus: string;
  isComprobante: boolean;
};

type ConversationMessageAttachment = {
  type: string;
  caption: string | null;
  mediaAssets: ConversationMessageAttachmentAsset[];
};

export type ConversationMessageAttachmentPreview =
  | {
      kind: 'image';
      key: string;
      src: string;
      href: string;
      downloadHref: string;
      alt: string;
      label: string;
      size: number | null;
      isComprobante: boolean;
    }
  | {
      kind: 'audio';
      key: string;
      src: string;
      href: string;
      downloadHref: string;
      label: string;
      size: number | null;
      isComprobante: boolean;
    }
  | {
      kind: 'video';
      key: string;
      src: string;
      href: string;
      downloadHref: string;
      label: string;
      size: number | null;
      isComprobante: boolean;
    }
  | {
      kind: 'link';
      key: string;
      href: string;
      label: string;
      size: number | null;
      isComprobante: boolean;
    };

export function getConversationMessageAttachmentPreviews(
   message: ConversationMessageAttachment,
 ): ConversationMessageAttachmentPreview[] {
    return message.mediaAssets.map((asset) => {
      const previewUrl = `/api/media/${asset.id}/preview`;
      const downloadUrl = `/api/media/${asset.id}/download`;
      const safeInlinePreview = isSafeInlineMediaPreviewMime(asset.mimeType);

      // Determine media kind based on asset properties, not just message.type
      const isImage = safeInlinePreview && asset.mimeType.startsWith('image/');
      const isAudio = asset.mimeType.startsWith('audio/');
      const isVideo = asset.mimeType.startsWith('video/');

      if (isImage && asset.downloadStatus === 'READY') {
        return {
          kind: 'image' as const,
          key: asset.id,
          src: previewUrl,
          href: previewUrl,
          downloadHref: downloadUrl,
          alt: message.caption?.trim() || asset.filename || 'Imagen adjunta',
          label: asset.filename || 'Imagen adjunta',
          size: asset.size ?? null,
          isComprobante: asset.isComprobante,
        };
      }

      if (isAudio && asset.downloadStatus === 'READY') {
        return {
          kind: 'audio' as const,
          key: asset.id,
          src: previewUrl,
          href: previewUrl,
          downloadHref: downloadUrl,
          label: asset.filename || 'Nota de audio',
          size: asset.size ?? null,
          isComprobante: asset.isComprobante,
        };
      }

      if (isVideo && asset.downloadStatus === 'READY') {
        return {
          kind: 'video' as const,
          key: asset.id,
          src: previewUrl,
          href: previewUrl,
          downloadHref: downloadUrl,
          label: asset.filename || 'Video adjunto',
          size: asset.size ?? null,
          isComprobante: asset.isComprobante,
        };
      }

      // Show processing/failed states based on downloadStatus
      const labelPrefix =
        asset.downloadStatus === 'READY' ? 'Adjunto: ' :
        asset.downloadStatus === 'FAILED' ? 'Error al adjunto: ' :
        'Adjunto en procesamiento: ';

      return {
        kind: 'link' as const,
        key: asset.id,
        href: asset.downloadStatus === 'READY' ? downloadUrl : `/comprobantes#${asset.id}`,
        label: `${labelPrefix}${asset.filename || asset.mimeType}`,
        size: asset.size ?? null,
        isComprobante: asset.isComprobante,
      };
   });
 }
import { isSafeInlineMediaPreviewMime } from '@/modules/media/mime';
