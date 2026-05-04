'use client';

import { useState } from 'react';
import { Modal } from '@/components/Modal';
import { isSafeInlineMediaPreviewMime } from '@/modules/media/mime';

type AssetData = {
  id: string;
  filename: string | null;
  mimeType: string;
  size: number | null;
  downloadStatus: string;
  downloadError: string | null;
  createdAt: string;
  storageKey: string | null;
};

export function AssetPopover({ asset }: { asset: AssetData }) {
  const [open, setOpen] = useState(false);
  const safeInlinePreview = isSafeInlineMediaPreviewMime(asset.mimeType);

  const isImage = safeInlinePreview && asset.mimeType.startsWith('image/');
  const isVideo = asset.mimeType.startsWith('video/');
  const isAudio = asset.mimeType.startsWith('audio/');
  const isPdf = safeInlinePreview && asset.mimeType === 'application/pdf';

  return (
    <>
      <button
        type="button"
        className="button-secondary"
        style={{ fontSize: '0.7rem', padding: '1px 6px' }}
        onClick={() => setOpen(true)}
      >
        Ver
      </button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <div className="stack" style={{ gap: 12, minWidth: 320, maxWidth: 500 }}>
          <div>
            <strong>{asset.filename || 'Sin nombre'}</strong>
            <br />
            <small>{new Date(asset.createdAt).toLocaleString('es-GT', { timeZone: 'America/Guatemala' })}</small>
            <br />
            <small>{asset.mimeType} · {asset.size ? `${(asset.size / 1024).toFixed(0)} KB` : '?'}</small>
          </div>
          {asset.downloadStatus === 'READY' && asset.storageKey && (
            <>
              {isImage && (
                <img
                  src={`/api/media/${asset.id}/preview`}
                  alt={asset.filename || 'Vista previa'}
                  style={{ maxWidth: '100%', maxHeight: 400, objectFit: 'contain', borderRadius: 6 }}
                />
              )}
              {isVideo && (
                <video controls src={`/api/media/${asset.id}/preview`} style={{ maxWidth: '100%', maxHeight: 400 }} />
              )}
              {isAudio && (
                <audio controls src={`/api/media/${asset.id}/preview`} style={{ width: '100%' }} />
              )}
              {isPdf && (
                <iframe src={`/api/media/${asset.id}/preview`} style={{ width: '100%', height: 400, border: 'none', borderRadius: 6 }} />
              )}
              {!safeInlinePreview && <p className="text-muted">Vista previa inline bloqueada por seguridad para este tipo de archivo.</p>}
              <a href={`/api/media/${asset.id}/download`} style={{ textAlign: 'center', display: 'block', fontSize: '0.85rem', padding: '4px 12px', background: 'var(--accent, #075e54)', color: '#fff', border: '1px solid var(--accent, #064e3b)', borderRadius: 2, textDecoration: 'none', fontWeight: 650 }}>
                Descargar
              </a>
            </>
          )}
          {asset.downloadStatus !== 'READY' && (
            <p className="text-muted">Vista previa no disponible ({asset.downloadStatus})</p>
          )}
        </div>
      </Modal>
    </>
  );
}
