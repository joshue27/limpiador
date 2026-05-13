'use client';

import { useEffect, useMemo, useState } from 'react';

import { initNotificationAudioUnlock, playNotificationSound } from '@/modules/notifications/audio';

type InboxToast = {
  id: string;
  message: string;
  type: 'message' | 'transfer';
};

export function NotificationBell() {
  const [toast, setToast] = useState<InboxToast | null>(null);
  const [toastQueue, setToastQueue] = useState<InboxToast[]>([]);
  const [visible, setVisible] = useState(false);

  const currentToastId = useMemo(() => toast?.id ?? null, [toast]);

  useEffect(() => {
    initNotificationAudioUnlock();

    let prevInboundCount: number | null = null;
    let prevQueue: number | null = null;
    let latestSeenAt: string | null = null;
    let seenInboundIds = new Set<string>();

    async function playMessageSounds(times: number, muted: boolean) {
      if (muted) return;
      const repetitions = Math.max(1, Math.min(times, 5));
      for (let index = 0; index < repetitions; index += 1) {
        await playNotificationSound('notification-message.mp3');
        if (index < repetitions - 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 250));
        }
      }
    }

    function enqueueToast(nextToast: InboxToast) {
      setToastQueue((current) => [...current, nextToast]);
    }

    function currentOpenConversationId() {
      const url = new URL(window.location.href);
      if (!url.pathname.startsWith('/inbox')) return null;
      return url.searchParams.get('conversation');
    }

    async function check() {
      try {
        const notificationsUrl = new URL('/api/inbox/notifications', window.location.origin);
        if (latestSeenAt) {
          notificationsUrl.searchParams.set('since', latestSeenAt);
        }

        const res = await fetch(notificationsUrl.toString(), {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          queueCount?: number;
          unreadCount?: number;
          inboundMessageCount?: number;
          recentInboundMessages?: Array<{
            id: string;
            conversationId: string;
            contactName: string;
            body: string | null;
            createdAt: string;
          }>;
        };

        const queueCount = data.queueCount ?? 0;
        const inboundMessageCount = data.inboundMessageCount ?? 0;
        const recentInboundMessages = data.recentInboundMessages ?? [];

        const muted =
          typeof window !== 'undefined' && localStorage.getItem('notifications-muted') === 'true';

        if (prevInboundCount === null) {
          seenInboundIds = new Set(recentInboundMessages.map((message) => message.id));
        } else if (inboundMessageCount > prevInboundCount) {
          const openConversationId = currentOpenConversationId();
          const newMessages = recentInboundMessages.filter(
            (message) => !seenInboundIds.has(message.id),
          );
          const toastableMessages = newMessages.filter(
            (message) => message.conversationId !== openConversationId,
          );

          for (const message of toastableMessages) {
            enqueueToast({
              id: `message-${message.id}`,
              type: 'message',
              message: message.body?.trim()
                ? `${message.contactName}: ${message.body.trim().slice(0, 90)}`
                : `${message.contactName}: Nuevo adjunto recibido`,
            });
            sendBrowserNotification(
              message.body?.trim()
                ? `${message.contactName}: ${message.body.trim().slice(0, 90)}`
                : `${message.contactName}: Nuevo adjunto recibido`,
            );
          }

          if (toastableMessages.length > 0) {
            void playMessageSounds(toastableMessages.length, muted);
          }
        }

        // New queued conversations (transfer/assignment)
        if (prevQueue !== null && queueCount > prevQueue) {
          enqueueToast({
            id: `transfer-${queueCount}-${Date.now()}`,
            type: 'transfer',
            message: `${queueCount} conversaciones en cola de tu departamento`,
          });
          if (!muted) void playNotificationSound('notification-transfer.mp3');
          sendBrowserNotification('Conversaciones asignadas a tu departamento');
        }

        prevInboundCount = inboundMessageCount;
        prevQueue = queueCount;
        if (recentInboundMessages.length > 0) {
          latestSeenAt =
            recentInboundMessages[recentInboundMessages.length - 1]?.createdAt ?? latestSeenAt;
          seenInboundIds = new Set([
            ...seenInboundIds,
            ...recentInboundMessages.map((message) => message.id),
          ]);
        }
      } catch {
        /* ignore */
      }
    }

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Check for transfer notification on page load
    const url = new URL(window.location.href);
    if (url.searchParams.get('transferred') === '1') {
      enqueueToast({
        id: `transfer-page-load-${Date.now()}`,
        type: 'transfer',
        message: 'Se te ha asignado una conversación',
      });
      const muted =
        typeof window !== 'undefined' && localStorage.getItem('notifications-muted') === 'true';
      if (!muted) void playNotificationSound('notification-transfer.mp3');
      sendBrowserNotification('Se te ha asignado una conversación');
      // Clean the URL param
      url.searchParams.delete('transferred');
      window.history.replaceState({}, '', url.toString());
    }

    void check();
    const timer = window.setInterval(() => void check(), 8000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (toast || toastQueue.length === 0) return;
    const [nextToast, ...rest] = toastQueue;
    setToast(nextToast);
    setToastQueue(rest);
    setVisible(true);
  }, [toast, toastQueue]);

  useEffect(() => {
    if (!currentToastId) return undefined;
    const timer = window.setTimeout(() => {
      dismissToast();
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [currentToastId]);

  function sendBrowserNotification(body: string) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('CleanApp', { body });
    }
  }

  function dismissToast() {
    setVisible(false);
    window.setTimeout(() => setToast(null), 300);
  }

  return (
    <>
      {toast && (
        <div
          className={`notification-toast ${toast.type === 'transfer' ? 'transfer-toast' : ''} ${visible ? '' : 'notification-toast-hide'}`}
          onClick={dismissToast}
        >
          <div>
            <strong>
              {toast.type === 'transfer' ? '📨 Chat transferido' : '💬 Nuevo mensaje'}
            </strong>
            <small>{toast.message}</small>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              dismissToast();
            }}
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
