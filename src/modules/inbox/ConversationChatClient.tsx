'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import AutoScrollToBottom from '@/modules/inbox/AutoScrollToBottom';
import { ChatComposer } from '@/modules/inbox/chat-composer';
import type { ConversationSearchMatch } from '@/modules/inbox/chat-search';
import { mergeRefreshedMessages, prependOlderPage, reconcileOptimisticRow } from '@/modules/inbox/merge';
import { MessageHistory, type QuotedMessageState } from '@/modules/inbox/message-history';

type ConversationChatClientProps = {
  conversationId: string;
  messages: QuotedMessageState[];
  currentUserId: string;
  isBlurred: boolean;
  canClaim: boolean;
  claimAction: string;
  canSendFreeText: boolean;
  bodyPlaceholder: string;
  fieldTag: 'input' | 'select';
  submitDisabled: boolean;
  submitLabel: string;
  openingTemplates: Array<{ key: string; label: string }>;
  oldestCursor: string;
  hasMoreOlder: boolean;
  chatSearchMatches: ConversationSearchMatch[];
  chatSearchActiveIndex: number;
};

export function ConversationChatClient({
  conversationId,
  messages: serverMessages,
  currentUserId,
  isBlurred,
  canClaim,
  claimAction,
  canSendFreeText,
  bodyPlaceholder,
  fieldTag,
  submitDisabled,
  submitLabel,
  openingTemplates,
  oldestCursor: initialOldestCursor,
  hasMoreOlder: initialHasMoreOlder,
  chatSearchMatches,
  chatSearchActiveIndex,
}: ConversationChatClientProps) {
  const [messages, setMessages] = useState<QuotedMessageState[]>(serverMessages);
  const [oldestCursor, setOldestCursor] = useState(initialOldestCursor);
  const [hasMoreOlder, setHasMoreOlder] = useState(initialHasMoreOlder);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const prevConversationId = useRef(conversationId);
  const [quotedMessage, setQuotedMessage] = useState<QuotedMessageState | null>(null);
  // Track server data digest to detect actual refresh changes vs React re-renders
  const prevServerDigest = useRef<string>('');

  // Reset or merge when server props change
  useEffect(() => {
    const isNewConversation = prevConversationId.current !== conversationId;
    prevConversationId.current = conversationId;

    if (isNewConversation) {
      setMessages(serverMessages);
      setOldestCursor(initialOldestCursor);
      setHasMoreOlder(initialHasMoreOlder);
      setQuotedMessage(null);
      prevServerDigest.current = '';
      return;
    }

    // Same conversation — detect if server data actually changed
    const digest = `${serverMessages.length}:${serverMessages[0]?.id ?? 'none'}:${serverMessages.at(-1)?.id ?? 'none'}`;
    if (digest !== prevServerDigest.current && serverMessages.length > 0) {
      prevServerDigest.current = digest;
      setMessages((prev) => mergeRefreshedMessages(prev, serverMessages));
    }
  }, [conversationId, serverMessages, initialOldestCursor, initialHasMoreOlder]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMoreOlder || !oldestCursor) return;

    setLoadingOlder(true);
    try {
      const response = await fetch(
        `/api/inbox/${conversationId}/messages?before=${encodeURIComponent(oldestCursor)}&limit=20`,
        { headers: { Accept: 'application/json' } },
      );

      if (!response.ok) return;

      const data = (await response.json()) as {
        messages: QuotedMessageState[];
        nextCursor: string | null;
        hasMore: boolean;
      };

      setMessages((prev) => prependOlderPage(prev, data.messages));
      setOldestCursor(data.nextCursor ?? '');
      setHasMoreOlder(data.hasMore);
    } catch {
      // Silently handled — user can retry by triggering load again
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, loadingOlder, hasMoreOlder, oldestCursor]);

  const appendOptimistic = useCallback((clientMsg: QuotedMessageState) => {
    setMessages((prev) => [...prev, clientMsg]);
  }, []);

  const reconcileMessage = useCallback((clientId: string, serverMsg: QuotedMessageState) => {
    setMessages((prev) => reconcileOptimisticRow(prev, clientId, serverMsg));
  }, []);

  const updateMessageStatus = useCallback((messageId: string, status: QuotedMessageState['status']) => {
    setMessages((prev) => prev.map((message) => message.id === messageId ? { ...message, status } : message));
  }, []);

  const retryMediaDownload = useCallback(async (mediaAssetId: string) => {
    try {
      await fetch(`/api/media/${mediaAssetId}/retry`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
      window.setTimeout(() => {
        void fetch(`/api/inbox/${conversationId}/messages?limit=20`, { headers: { Accept: 'application/json' } })
          .then((response) => response.ok ? response.json() : null)
          .then((data) => {
            if (!data?.messages) return;
            setMessages((prev) => mergeRefreshedMessages(prev, data.messages as QuotedMessageState[]));
          })
          .catch(() => undefined);
      }, 1200);
    } catch {
      // Silently fail, user can retry again
    }
  }, [conversationId]);

  const lastMessageId = messages.at(-1)?.id ?? '';

  // Keep the message counter in the server-rendered header in sync
  useEffect(() => {
    const el = document.getElementById('message-count');
    if (el) el.textContent = `${messages.length} mensajes`;
  }, [messages.length]);

  return (
    <>
      <section className={`message-history${isBlurred ? ' message-history-blurred' : ''}`}>
        {isBlurred && canClaim && (
          <div className="claim-overlay">
            <div className="claim-overlay-box">
              <p>Esta conversación está en cola del departamento. Tomala para empezar a atender.</p>
              <form action={claimAction} method="post">
                <button type="submit" className="compact-action-button">Atender</button>
              </form>
            </div>
          </div>
        )}
        <MessageHistory
          messages={messages}
          quotedMessage={quotedMessage}
          setQuotedMessage={setQuotedMessage}
          currentUserId={currentUserId}
          conversationId={conversationId}
          hasMoreOlder={hasMoreOlder}
          loadingOlder={loadingOlder}
          onLoadOlder={loadOlder}
          chatSearchMatches={chatSearchMatches}
          chatSearchActiveIndex={chatSearchActiveIndex}
          onRetryState={updateMessageStatus}
          onRetryMediaDownload={retryMediaDownload}
        />
        <AutoScrollToBottom watchKey={`${conversationId}:${messages.length}:${lastMessageId}`} />
      </section>
      {!isBlurred && (
        <section className="conversation-composer" aria-label="Redacción del chat">
          <ChatComposer
            action={`/api/inbox/${conversationId}/messages`}
            canSendFreeText={canSendFreeText}
            bodyPlaceholder={quotedMessage ? `Respondiendo a: ${quotedMessage.body ?? quotedMessage.caption ?? (
              quotedMessage.type === 'IMAGE' ? 'Imagen' :
              quotedMessage.type === 'AUDIO' ? 'Audio' :
              quotedMessage.type === 'VIDEO' ? 'Video' :
              quotedMessage.type === 'DOCUMENT' ? 'Documento' :
              'Mensaje'
            )}` : bodyPlaceholder}
            fieldTag={fieldTag}
            submitDisabled={submitDisabled}
            submitLabel={submitLabel}
            openingTemplates={openingTemplates}
            quotedMessage={quotedMessage}
            onClearQuote={() => setQuotedMessage(null)}
            onOptimisticSend={appendOptimistic}
            onReconcileMessage={reconcileMessage}
          />
        </section>
      )}
    </>
  );
}
