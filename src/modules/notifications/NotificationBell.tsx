'use client';

import { useEffect, useState } from 'react';

async function playSound(file: string) {
  try {
    const audio = new Audio(`/${file}?${Date.now()}`);
    audio.volume = 0.5;
    await audio.play();
  } catch {
    // Fallback: Web Audio tone
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      gain.gain.value = 0.15;
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.setValueAtTime(1000, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch { /* ignore */ }
  }
}

export function NotificationBell() {
  const [toast, setToast] = useState<{ message: string; type: 'message' | 'transfer' } | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let prevInbox = 0;
    let prevQueue = 0;

    async function check() {
      try {
        const res = await fetch('/api/inbox/notifications', { headers: { Accept: 'application/json' }, cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json() as { queueCount?: number; unreadCount?: number };

        const queueCount = data.queueCount ?? 0;
        const unreadCount = data.unreadCount ?? 0;

        const muted = typeof window !== 'undefined' && localStorage.getItem('notifications-muted') === 'true';

        // New messages detection
        if (unreadCount > prevInbox && prevInbox > 0) {
          showToast('Nuevos mensajes en tus conversaciones', 'message');
          if (!muted) playSound('notification-message.mp3');
          sendBrowserNotification('Nuevos mensajes recibidos');
        }

        // New queued conversations (transfer/assignment)
        if (queueCount > prevQueue && prevQueue > 0) {
          showToast(`${queueCount} conversaciones en cola de tu departamento`, 'transfer');
          if (!muted) playSound('notification-transfer.mp3');
          sendBrowserNotification('Conversaciones asignadas a tu departamento');
        }

        prevInbox = unreadCount;
        prevQueue = queueCount;
      } catch { /* ignore */ }
    }

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Check for transfer notification on page load
    const url = new URL(window.location.href);
    if (url.searchParams.get('transferred') === '1') {
      showToast('Se te ha asignado una conversación', 'transfer');
      const muted = typeof window !== 'undefined' && localStorage.getItem('notifications-muted') === 'true';
      if (!muted) playSound('notification-transfer.mp3');
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
            <strong>{toast.type === 'transfer' ? '📨 Chat transferido' : '💬 Nuevo mensaje'}</strong>
            <small>{toast.message}</small>
          </div>
          <button type="button" onClick={(e) => { e.stopPropagation(); dismissToast(); }}>×</button>
        </div>
      )}
    </>
  );
}
