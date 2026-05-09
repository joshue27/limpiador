'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/Modal';
import { ComprobanteToggleButton } from '@/modules/inbox/ComprobanteToggleButton';
import { getConversationMessageAttachmentPreviews } from '@/modules/inbox/message-attachments';
import type { ConversationSearchMatch } from '@/modules/inbox/chat-search';
import { splitTextSearchMatches } from '@/modules/inbox/chat-search';

export const messageDirectionLabels: Record<string, string> = {
  INBOUND: 'Cliente',
  OUTBOUND: 'Operador',
};

export const messageTypeLabels: Record<string, string> = {
  TEXT: 'Texto',
  IMAGE: 'Imagen',
  AUDIO: 'Audio',
  VIDEO: 'Video',
  DOCUMENT: 'Documento',
  STICKER: 'Sticker',
  TEMPLATE: 'Plantilla',
  UNKNOWN: 'Desconocido',
};

export const messageStatusLabels: Record<string, string> = {
  PENDING: 'Pendiente',
  RECEIVED: 'Recibido',
  SENT: 'Enviado',
  DELIVERED: 'Entregado',
  READ: 'Leído',
  FAILED: 'Con error',
};

function labelFor(labels: Record<string, string>, value: string) {
  return labels[value] ?? value;
}

function formatShortDate(date: Date | string | null) {
  if (!date) return 'Sin fecha';
  return new Intl.DateTimeFormat('es', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Guatemala',
  }).format(new Date(date));
}

export type QuotedMessageState = {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT' | 'STICKER' | 'TEMPLATE' | 'UNKNOWN';
  body: string | null;
  caption: string | null;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'RECEIVED';
  createdAt: Date | string;
  mediaAssets: Array<{
    id: string;
    filename: string | null;
    mimeType: string;
    size: number | null;
    downloadStatus: string;
    isComprobante: boolean;
  }>;
  rawJson: unknown;
};

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes === 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(preview: { label: string }): string {
  const dot = preview.label.lastIndexOf('.');
  if (dot === -1) return '?';
  return preview.label.slice(dot + 1).slice(0, 4);
}

type MessageHistoryProps = {
  messages: QuotedMessageState[];
  quotedMessage: QuotedMessageState | null;
  setQuotedMessage: (message: QuotedMessageState | null) => void;
  hasMoreOlder?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
  chatSearchMatches?: ConversationSearchMatch[];
  chatSearchActiveIndex?: number;
  onRetryState?: (messageId: string, status: QuotedMessageState['status']) => void;
  onRetryMediaDownload?: (mediaAssetId: string) => void;
};

export function MessageHistory({
  messages,
  setQuotedMessage,
  currentUserId,
  conversationId,
  hasMoreOlder = false,
  loadingOlder = false,
  onLoadOlder,
  chatSearchMatches = [],
  chatSearchActiveIndex = -1,
  onRetryState,
  onRetryMediaDownload,
}: MessageHistoryProps & { currentUserId: string; conversationId: string }) {
  const router = useRouter();
  const [expandedImage, setExpandedImage] = useState<{ src: string; alt: string } | null>(null);
  const [hideMenuMessageId, setHideMenuMessageId] = useState<string | null>(null);

  // Scroll to active search match when navigating between matches
  useEffect(() => {
    if (chatSearchActiveIndex < 0) return;
    const timer = setTimeout(() => {
      const active = document.querySelector('[data-search-active="true"]');
      if (active) {
        active.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150); // Wait for React to render after props change
    return () => clearTimeout(timer);
  }, [chatSearchActiveIndex, chatSearchMatches]);

  function getMessageMatches(messageId: string, field: ConversationSearchMatch['field'], assetId?: string) {
    return chatSearchMatches.filter((match) => (
      match.messageId === messageId
      && match.field === field
      && (field !== 'filename' || match.assetId === assetId)
    ));
  }

  function highlightText(text: string, messageId: string, field: ConversationSearchMatch['field'], assetId?: string) {
    if (!chatSearchMatches.length) return text;
    const fieldMatches = getMessageMatches(messageId, field, assetId);
    if (!fieldMatches.length) return text;
    return splitTextSearchMatches(text, fieldMatches, chatSearchActiveIndex).map((part) => {
      if (!part.highlighted) return part.text;
      return (
        <mark
          key={`${part.index}-${part.text}-${part.active ? 'active' : 'match'}`}
          className={part.active ? 'search-highlight search-highlight-active' : 'search-highlight'}
          {...(part.active ? { 'data-search-active': 'true' } : {})}
        >
          {part.text}
        </mark>
      );
    });
  }
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Older-message scroll sentinel
  const handleLoadOlder = useCallback(() => {
    if (hasMoreOlder && !loadingOlder && onLoadOlder) {
      onLoadOlder();
    }
  }, [hasMoreOlder, loadingOlder, onLoadOlder]);

  useEffect(() => {
    if (!hasMoreOlder || !onLoadOlder) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          handleLoadOlder();
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreOlder, onLoadOlder, handleLoadOlder]);

  useEffect(() => {
    if (!hideMenuMessageId) return;
    function onClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest('.hide-message-menu')) setHideMenuMessageId(null);
    }
    document.addEventListener('click', onClickOutside);
    return () => document.removeEventListener('click', onClickOutside);
  }, [hideMenuMessageId]);

  const handleQuote = (message: QuotedMessageState) => {
    setQuotedMessage(message);
    setTimeout(() => {
      const bodyInput = document.querySelector(
        'input[name="body"]'
      ) as HTMLInputElement | null;
      bodyInput?.focus();
    }, 100);
  };

  const handleRetry = async (message: QuotedMessageState) => {
    try {
      onRetryState?.(message.id, 'PENDING');
      const fd = new FormData();
      fd.set('retryMessageId', message.id);
      if (message.body) fd.set('body', message.body);
      const response = await fetch(`/api/inbox/${conversationId}/messages`, {
        method: 'POST',
        body: fd,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        onRetryState?.(message.id, 'FAILED');
        return;
      }
      router.refresh();
    } catch {
      // Silently fail — message stays as FAILED
      onRetryState?.(message.id, 'FAILED');
    }
  };

  const handleRetryMediaDownload = async (mediaAssetId: string) => {
    if (!onRetryMediaDownload) return;
    onRetryMediaDownload(mediaAssetId);
  };

  async function handleHide(message: QuotedMessageState, scope: 'me' | 'everyone') {
    try {
      await fetch(`/api/inbox/${conversationId}/messages/${message.id}/hide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
      });
      router.refresh();
    } catch {
      // Silently fail, retry on next poll
    }
  }

  return (
    <section className="message-history">
      <div className="messages">
        {hasMoreOlder && (
          <>
            <div
              ref={sentinelRef}
              className="load-older-sentinel"
              aria-busy={loadingOlder || undefined}
            >
              {loadingOlder ? (
                <span className="sr-only">Cargando mensajes anteriores…</span>
              ) : null}
            </div>
            <div className="load-older-button-row">
              <button
                type="button"
                className="load-older-button"
                disabled={loadingOlder}
                onClick={handleLoadOlder}
              >
                {loadingOlder ? 'Cargando…' : 'Cargar mensajes anteriores'}
              </button>
            </div>
          </>
        )}
        {messages.map((message) => {
          if (!message) return null;

          // Show quoted message preview if this message has a quoted message in rawJson
          const rawJson = message.rawJson && typeof message.rawJson === 'object' ? message.rawJson as {
            quotedMessageId?: string;
            quotedMessagePreview?: { body: string | null; caption: string | null; type: string; direction: 'INBOUND' | 'OUTBOUND' };
          } : null;
          const quotedMessagePreview =
            rawJson?.quotedMessageId &&
            rawJson.quotedMessagePreview
              ? rawJson.quotedMessagePreview
              : null;

          return (
            <div key={message.id} className={`message-bubble ${message.direction.toLowerCase()}`}>
              {quotedMessagePreview && (
                <div className="quoted-message-preview">
                  <div className="quoted-message-header"><small>En respuesta a</small></div>
                  <div className="quoted-message-content">
                    {quotedMessagePreview.body ?? quotedMessagePreview.caption ?? `Adjunto: ${labelFor(
                      messageTypeLabels,
                      quotedMessagePreview.type
                    )}`}
                  </div>
                </div>
              )}
              <div className="message-bubble-header">
                <small>
                  {labelFor(messageDirectionLabels, message.direction)} ·
                  {labelFor(messageTypeLabels, message.type)} ·
                  Estado: {labelFor(messageStatusLabels, message.status)} ·
                  {formatShortDate(message.createdAt)}
                </small>
                <div className="message-bubble-actions">
                  {(message.body || message.caption || message.mediaAssets?.length) ? (
                    <button
                      type="button"
                      className="quote-button"
                      aria-label="Responder citando este mensaje"
                      onClick={() => handleQuote(message)}
                    >
                      ↩
                    </button>
                  ) : null}
                  <div className="hide-message-menu">
                    <button
                      type="button"
                      className="quote-button"
                      aria-label="Ocultar mensaje"
                      onClick={() => setHideMenuMessageId(hideMenuMessageId === message.id ? null : message.id)}
                    >
                      ⋯
                    </button>
                    {hideMenuMessageId === message.id && (
                      <div className="hide-message-popover">
                        <button type="button" onClick={() => { handleHide(message, 'me'); setHideMenuMessageId(null); }}>Ocultar para mí</button>
                        <button type="button" onClick={() => { handleHide(message, 'everyone'); setHideMenuMessageId(null); }}>Ocultar para todos</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {message.body ? (
                <p>{highlightText(message.body, message.id, 'body')}</p>
              ) : null}
              {message.caption && message.caption !== message.body ? (
                <p className="message-caption">{highlightText(message.caption, message.id, 'caption')}</p>
              ) : null}
              {getConversationMessageAttachmentPreviews(message).map((preview) => {
                const sizeText = formatFileSize(preview.size);
                const sizeBadge = sizeText ? <span className="file-size-badge">{sizeText}</span> : null;
                const markButton = <ComprobanteToggleButton
                  mediaAssetId={preview.key}
                  initialMarked={preview.isComprobante}
                />;

                if (preview.kind === 'image') {
                  return (
                    <div key={preview.key} className="message-media-preview">
                      <button
                        type="button"
                        className="message-image-clickable"
                        aria-label={`Ampliar ${preview.alt}`}
                        onClick={() => setExpandedImage({ src: preview.src, alt: preview.alt })}
                      >
                        <img
                          src={preview.src}
                          alt={preview.alt}
                          className="message-image-preview"
                        />
                      </button>
                      <div className="message-media-actions">
                        {markButton}
                        <a href={preview.downloadHref} className="message-attachment-link">
                          Descargar
                        </a>
                        {sizeBadge}
                      </div>
                    </div>
                  );
                }
                if (preview.kind === 'audio') {
                  return (
                    <div key={preview.key} className="message-media-preview">
                      <audio controls preload="metadata" src={preview.src} />
                      <div className="message-media-actions">
                        {markButton}
                        <a href={preview.downloadHref} className="message-attachment-link">
                          Descargar
                        </a>
                        {sizeBadge}
                      </div>
                    </div>
                  );
                }
                if (preview.kind === 'video') {
                  return (
                    <div key={preview.key} className="message-media-preview">
                      <video controls preload="metadata" src={preview.src} className="message-video-preview" />
                      <div className="message-media-actions">
                        {markButton}
                        <a href={preview.downloadHref} className="message-attachment-link">
                          Descargar
                        </a>
                        {sizeBadge}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={preview.key} className="message-media-preview message-document-preview">
                    <div className="message-document-icon">
                      {getFileExtension(preview)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <a href={preview.href} className="message-attachment-link" style={{ fontSize: '0.8rem', wordBreak: 'break-word' }}>
                        {preview.label}
                      </a>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        {markButton}
                        {preview.downloadStatus === 'FAILED' ? (
                          <button
                            type="button"
                            className="retry-button"
                            onClick={() => handleRetryMediaDownload(preview.assetId)}
                          >
                            Reintentar descarga
                          </button>
                        ) : null}
                        {sizeBadge}
                      </div>
                    </div>
                  </div>
                );
              })}
              {message.status === 'FAILED' && message.direction === 'OUTBOUND' && message.type === 'TEXT' && (
                <button type="button" className="retry-button" onClick={() => handleRetry(message)}>
                  Reenviar
                </button>
              )}
            </div>
          );
        })}
      </div>
      <Modal open={expandedImage !== null} onClose={() => setExpandedImage(null)}>
        {expandedImage && (
          <img
            src={expandedImage.src}
            alt={expandedImage.alt}
            className="modal-image-full"
          />
        )}
      </Modal>
    </section>
  );
}
