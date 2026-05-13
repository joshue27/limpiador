'use client';

import { useEffect, useState } from 'react';

import { initNotificationAudioUnlock, playNotificationSound } from '@/modules/notifications/audio';

export function NotificationBell() {
  const [toast, setToast] = useState<{ message: string; type: 'message' | 'transfer' } | null>(
    null,
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    initNotificationAudioUnlock();

    let prevInboundCount: number | null = null;
    let prevQueue: number | null = null;

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

    async function check() {
      try {
        const res = await fetch('/api/inbox/notifications', {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          queueCount?: number;
          unreadCount?: number;
          inboundMessageCount?: number;
        };

        const queueCount = data.queueCount ?? 0;
        const inboundMessageCount = data.inboundMessageCount ?? 0;

        const muted =
          typeof window !== 'undefined' && localStorage.getItem('notifications-muted') === 'true';

        if (prevInboundCount !== null && inboundMessageCount > prevInboundCount) {
          const delta = inboundMessageCount - prevInboundCount;
          showToast(
            delta === 1
              ? 'Nuevo mensaje en tus conversaciones'
              : `${delta} nuevos mensajes en tus conversaciones`,
            'message',
          );
          void playMessageSounds(delta, muted);
          sendBrowserNotification(
            delta === 1 ? 'Nuevo mensaje recibido' : `${delta} mensajes nuevos recibidos`,
          );
        }

        // New queued conversations (transfer/assignment)
        if (prevQueue !== null && queueCount > prevQueue) {
          showToast(`${queueCount} conversaciones en cola de tu departamento`, 'transfer');
          if (!muted) void playNotificationSound('notification-transfer.mp3');
          sendBrowserNotification('Conversaciones asignadas a tu departamento');
        }

        prevInboundCount = inboundMessageCount;
        prevQueue = queueCount;
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
      showToast('Se te ha asignado una conversación', 'transfer');
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

  function showToast(message: string, type: 'message' | 'transfer') {
    setToast({ message, type });
    setVisible(true);
  }

  function sendBrowserNotification(body: string) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('CleanApp', { body });
    }
  }

  function dismissToast() {
    setVisible(false);
    setTimeout(() => setToast(null), 300);
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
