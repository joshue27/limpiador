'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { getComposerAttachmentPills } from '@/modules/inbox/composer-attachment-pill';
import { composerEmojiOptions, insertEmojiIntoComposer } from '@/modules/inbox/composer-emojis';
import { makeClientId } from '@/modules/inbox/merge';
import type { QuotedMessageState } from '@/modules/inbox/message-history';

type OpeningTemplate = {
    key: string;
    label: string;
};

type ChatComposerProps = {
    action: string;
    canSendFreeText: boolean;
    bodyPlaceholder: string;
    fieldTag: 'input' | 'select';
    submitDisabled: boolean;
    submitLabel: string;
    openingTemplates: OpeningTemplate[];
    quotedMessage: {
        id: string;
        body: string | null;
        caption: string | null;
        type?: string;
        mediaAssets?: Array<{ filename: string | null }>;
    } | null;
    onClearQuote?: () => void;
    onOptimisticSend?: (clientMsg: QuotedMessageState) => void;
    onReconcileMessage?: (clientId: string, serverMsg: QuotedMessageState) => void;
};

export function ChatComposer(props: ChatComposerProps) {
    const router = useRouter();
    const formRef = useRef<HTMLFormElement | null>(null);
    const attachmentInputRef = useRef<HTMLInputElement | null>(null);
    const bodyInputRef = useRef<HTMLInputElement | null>(null);
    const sendingRef = useRef(false);
    const [selectedAttachments, setSelectedAttachments] = useState<File[]>([]);
    const [bodyValue, setBodyValue] = useState('');
    const [emojiPopoverOpen, setEmojiPopoverOpen] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const attachmentPills = getComposerAttachmentPills(selectedAttachments);
    const canShowEmojiPopover = props.canSendFreeText && props.fieldTag === 'input';

    function syncAttachmentInput(files: File[]) {
        if (!attachmentInputRef.current) {
            return;
        }

        if (files.length === 0) {
            attachmentInputRef.current.value = '';
            return;
        }

        const nextFiles = new DataTransfer();
        files.forEach((file) => nextFiles.items.add(file));
        attachmentInputRef.current.files = nextFiles.files;
    }

    async function submitWithFetch(form: HTMLFormElement) {
        if (sendingRef.current) return;
        sendingRef.current = true;
        setNotice(null);

        try {
            const hasAttachments = selectedAttachments.length > 0;
            const body = bodyValue.trim();
            const isTextOnly = props.canSendFreeText && body && !hasAttachments && props.fieldTag === 'input';

            if (props.onOptimisticSend) {
                if (isTextOnly) {
                    await submitTextOptimistic(form, body);
                } else if (hasAttachments) {
                    await submitAttachmentOptimistic(form);
                } else {
                    await submitStandard(form);
                }
            } else {
                await submitStandard(form);
            }
        } catch {
            setNotice('Ocurrió un error inesperado. Intentá de nuevo.');
        } finally {
            sendingRef.current = false;
        }
    }

    async function submitTextOptimistic(form: HTMLFormElement, body: string) {
        const clientId = makeClientId();
        const optimisticMsg: QuotedMessageState = {
            id: clientId,
            direction: 'OUTBOUND',
            type: 'TEXT',
            body,
            caption: null,
            status: 'PENDING',
            createdAt: new Date().toISOString(),
            mediaAssets: [],
            rawJson: {},
        };

        // Append optimistic bubble immediately
        props.onOptimisticSend?.(optimisticMsg);

        // Clear composer immediately (WhatsApp-like instant feedback)
        setBodyValue('');
        setSelectedAttachments([]);
        syncAttachmentInput([]);
        props.onClearQuote?.();
        form.reset();
        bodyInputRef.current?.focus();

        try {
            const response = await fetch(props.action, {
                method: 'POST',
                body: new FormData(form),
                headers: { Accept: 'application/json' },
            });
            const payload = (await response.json().catch(() => null)) as
                | { ok?: boolean; notice?: string; message?: QuotedMessageState }
                | null;

            if (response.ok && payload?.ok && payload.message) {
                // Success: replace optimistic row with server message
                props.onReconcileMessage?.(clientId.replace(/^client:/, ''), payload.message);
            } else if (payload?.message) {
                // Server persisted a FAILED row — reconcile with it
                props.onReconcileMessage?.(clientId.replace(/^client:/, ''), payload.message);
                setNotice(payload.notice ?? 'El mensaje no pudo enviarse.');
            } else {
                // No message in response (unexpected) — mark optimistic as FAILED
                const failedMsg: QuotedMessageState = {
                    ...optimisticMsg,
                    status: 'FAILED',
                };
                props.onReconcileMessage?.(clientId.replace(/^client:/, ''), failedMsg);
                setNotice(payload?.notice ?? 'No se pudo enviar el mensaje.');
            }
        } catch {
            // Network error — mark optimistic as FAILED
            const failedMsg: QuotedMessageState = {
                ...optimisticMsg,
                status: 'FAILED',
            };
            props.onReconcileMessage?.(clientId.replace(/^client:/, ''), failedMsg);
            setNotice('No se pudo enviar el mensaje. Revisá la conexión e intentá de nuevo.');
        }
    }

    async function submitAttachmentOptimistic(form: HTMLFormElement) {
        const clientId = makeClientId();
        const firstFile = selectedAttachments[0];
        const mimeType = firstFile?.type ?? 'application/octet-stream';
        const messageType: QuotedMessageState['type'] =
            mimeType.startsWith('image/') ? 'IMAGE' :
            mimeType.startsWith('audio/') ? 'AUDIO' :
            mimeType.startsWith('video/') ? 'VIDEO' :
            'DOCUMENT';

        const optimisticMsg: QuotedMessageState = {
            id: clientId,
            direction: 'OUTBOUND',
            type: messageType,
            body: bodyValue || null,
            caption: null,
            status: 'PENDING',
            createdAt: new Date().toISOString(),
            mediaAssets: selectedAttachments.map((file, index) => ({
                id: `client:asset:${clientId}:${index}`,
                filename: file.name,
                mimeType: file.type || 'application/octet-stream',
                size: file.size,
                downloadStatus: 'PENDING',
                isComprobante: false,
            })),
            rawJson: {},
        };

        // Append optimistic bubble immediately
        props.onOptimisticSend?.(optimisticMsg);

        // Clear composer immediately (same as text path)
        setBodyValue('');
        const savedAttachments = [...selectedAttachments];
        setSelectedAttachments([]);
        syncAttachmentInput([]);
        props.onClearQuote?.();
        form.reset();
        bodyInputRef.current?.focus();

        try {
            // Rebuild FormData with the saved files
            const fd = new FormData();
            if (bodyValue) fd.set('body', bodyValue);
            if (props.quotedMessage) fd.set('quotedMessageId', props.quotedMessage.id);
            const templateKey = new FormData(form).get('templateKey');
            if (typeof templateKey === 'string' && templateKey) fd.set('templateKey', templateKey);
            savedAttachments.forEach((file) => fd.append('attachment', file));

            const response = await fetch(props.action, {
                method: 'POST',
                body: fd,
                headers: { Accept: 'application/json' },
            });
            const payload = (await response.json().catch(() => null)) as
                | { ok?: boolean; notice?: string; message?: QuotedMessageState }
                | null;

            if (response.ok && payload?.ok && payload.message) {
                // Success: replace optimistic row with server message
                props.onReconcileMessage?.(clientId.replace(/^client:/, ''), payload.message);
            } else if (payload?.message) {
                // Server persisted a FAILED row — reconcile with it
                props.onReconcileMessage?.(clientId.replace(/^client:/, ''), payload.message);
                setNotice(payload.notice ?? 'El archivo no pudo enviarse.');
            } else {
                // No message in response — mark optimistic as FAILED
                const failedMsg: QuotedMessageState = {
                    ...optimisticMsg,
                    status: 'FAILED',
                };
                props.onReconcileMessage?.(clientId.replace(/^client:/, ''), failedMsg);
                setNotice(payload?.notice ?? 'No se pudo enviar el archivo.');
            }
        } catch {
            const failedMsg: QuotedMessageState = {
                ...optimisticMsg,
                status: 'FAILED',
            };
            props.onReconcileMessage?.(clientId.replace(/^client:/, ''), failedMsg);
            setNotice('No se pudo enviar el archivo. Revisá la conexión e intentá de nuevo.');
        }
    }

    async function submitStandard(form: HTMLFormElement) {
        try {
            const response = await fetch(props.action, {
                method: 'POST',
                body: new FormData(form),
                headers: { Accept: 'application/json' },
            });
            const payload = (await response.json().catch(() => null)) as
                | { ok?: boolean; notice?: string }
                | null;

            if (!response.ok || !payload?.ok) {
                setNotice(payload?.notice ?? 'No se pudo enviar el mensaje.');
                return;
            }

            setBodyValue('');
            setSelectedAttachments([]);
            syncAttachmentInput([]);
            props.onClearQuote?.();
            form.reset();
            router.refresh();
            window.setTimeout(() => router.refresh(), 700);
            bodyInputRef.current?.focus();
        } catch {
            setNotice('No se pudo enviar el mensaje. Revisá la conexión e intentá de nuevo.');
        }
    }

    return (
        <form
            ref={formRef}
            action={props.action}
            method="post"
            encType="multipart/form-data"
            className="composer-form"
            onSubmit={(event) => {
                event.preventDefault();
                void submitWithFetch(event.currentTarget);
            }}
        >
            {props.quotedMessage ? (
                <div className="composer-quoted-preview">
                    <div>
                        <small>Respondiendo a</small>
                        <p>{props.quotedMessage.body ?? props.quotedMessage.caption ?? (
                            props.quotedMessage.type === 'IMAGE' ? 'Imagen' :
                            props.quotedMessage.type === 'AUDIO' ? 'Audio' :
                            props.quotedMessage.type === 'VIDEO' ? 'Video' :
                            props.quotedMessage.type === 'DOCUMENT' ? 'Documento' :
                            props.quotedMessage.type === 'STICKER' ? 'Sticker' :
                            'Mensaje'
                        )}</p>
                    </div>
                    <button type="button" className="clear-quote-button" aria-label="Cancelar respuesta citada" onClick={props.onClearQuote}>×</button>
                </div>
            ) : null}
            <div className="composer-inline-row">
                <div className="composer-toolbar" aria-label="Acciones preparadas para próximos pasos">
                    <div className="composer-emoji-control">
                        <button
                            type="button"
                            className="button-secondary compact-icon-button"
                            disabled={!canShowEmojiPopover}
                            aria-label="Insertar emoji"
                            aria-expanded={canShowEmojiPopover ? emojiPopoverOpen : undefined}
                            aria-haspopup={canShowEmojiPopover ? 'dialog' : undefined}
                            onClick={() => {
                                if (!canShowEmojiPopover) {
                                    return;
                                }

                                setEmojiPopoverOpen((currentOpen) => !currentOpen);
                            }}
                        >
                            😄
                        </button>
                        {canShowEmojiPopover && emojiPopoverOpen ? (
                            <div className="composer-emoji-popover" role="dialog" aria-label="Elegir emoji">
                                <div className="composer-emoji-grid">
                                    {composerEmojiOptions.map((emojiOption) => (
                                        <button
                                            key={emojiOption.value}
                                            type="button"
                                            className="button-secondary compact-icon-button composer-emoji-option"
                                            aria-label={emojiOption.label}
                                            title={emojiOption.label}
                                            onClick={() => {
                                                setBodyValue((currentValue) => insertEmojiIntoComposer(currentValue, emojiOption.value));
                                                setEmojiPopoverOpen(false);
                                                bodyInputRef.current?.focus();
                                            }}
                                        >
                                            {emojiOption.value}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                    {props.canSendFreeText ? (
                        <label className="composer-attachment-field">
                            <span className="sr-only">Adjuntar imagen o PDF</span>
                            <span className="button-secondary compact-icon-button" aria-hidden="true">➕</span>
                            <input
                                ref={attachmentInputRef}
                                type="file"
                                name="attachment"
                                multiple
                                accept="application/pdf,.pdf,image/jpeg,.jpg,.jpeg,image/png,.png,application/msword,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/vnd.ms-excel,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,application/vnd.ms-powerpoint,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pptx"
                                aria-label="Adjuntar imagen o PDF"
                                onChange={(event) => setSelectedAttachments(Array.from(event.currentTarget.files ?? []))}
                            />
                        </label>
                    ) : (
                        <button type="button" className="button-secondary compact-icon-button" disabled aria-label="Adjuntos disponibles con ventana activa">➕</button>
                    )}
                </div>
                {props.fieldTag === 'input' ? (
                    <label className="composer-field composer-field-inline">
                        <span className="sr-only">Mensaje</span>
                        <input
                            ref={bodyInputRef}
                            name="body"
                            value={bodyValue}
                            placeholder={props.bodyPlaceholder}
                            disabled={!props.canSendFreeText}
                            onChange={(event) => setBodyValue(event.currentTarget.value)}
                        />
                    </label>
                ) : (
                    <label className="composer-field composer-field-inline template-picker-field">
                        <span className="sr-only">Plantilla de apertura</span>
                        <select name="templateKey" defaultValue="" disabled={props.openingTemplates.length === 0} required={props.openingTemplates.length > 0}>
                            <option value="">{props.openingTemplates.length ? 'Plantilla' : 'Sin plantillas'}</option>
                            {props.openingTemplates.map((template) => (
                                <option key={template.key} value={template.key}>{template.label}</option>
                            ))}
                        </select>
                    </label>
                )}
                {props.quotedMessage && (
                    <input
                        type="hidden"
                        name="quotedMessageId"
                        value={props.quotedMessage.id}
                    />
                )}
                <button type="submit" className="compact-action-button" disabled={props.submitDisabled}>{props.submitLabel}</button>
            </div>
            {notice ? <p className="composer-notice-error" role="alert">{notice}</p> : null}
            {attachmentPills.length > 0 ? (
                <div className="composer-attachment-pill-row">
                    {attachmentPills.map((attachmentPill, index) => (
                        <span key={`${attachmentPill.filename}-${index}`} className="composer-attachment-pill" title={attachmentPill.filename}>
                            <span className="composer-attachment-pill-name">{attachmentPill.filename}</span>
                            <button
                                type="button"
                                className="composer-attachment-pill-remove"
                                aria-label={attachmentPill.removeLabel}
                                onClick={() => {
                                    const nextAttachments = selectedAttachments.filter((_, attachmentIndex) => attachmentIndex !== index);
                                    setSelectedAttachments(nextAttachments);
                                    syncAttachmentInput(nextAttachments);
                                }}
                            >
                                ×
                            </button>
                        </span>
                    ))}
                </div>
            ) : null}
        </form>
    );
}
