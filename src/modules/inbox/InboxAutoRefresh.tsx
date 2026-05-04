'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export function InboxAutoRefresh({ intervalMs = 2000 }: { intervalMs?: number }) {
  const router = useRouter();
  const listIntervalMs = 10000; // Full list refresh every 10s when no conversation selected
  const lastListRefreshRef = useRef(0);

  useEffect(() => {
    let lastSignature: string | null = null;
    let inFlight = false;
    let sseHealthy = false;
    let eventSource: EventSource | null = null;

    async function checkSelectedConversation() {
      if (document.visibilityState !== 'visible') return;

      const conversationId = new URL(window.location.href).searchParams.get('conversation');
      
      // No conversation selected: refresh the full list periodically
      if (!conversationId) {
        const now = Date.now();
        if (now - lastListRefreshRef.current >= listIntervalMs) {
          lastListRefreshRef.current = now;
          router.refresh();
        }
        return;
      }

      if (inFlight) return;

      inFlight = true;
      try {
        const response = await fetch(`/api/inbox/${conversationId}/version`, {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        if (!response.ok) return;

        const payload = await response.json() as { signature?: string };
        if (!payload.signature) return;

        if (lastSignature === null) {
          lastSignature = payload.signature;
          return;
        }

        if (payload.signature !== lastSignature) {
          lastSignature = payload.signature;
          router.refresh();
        }
      } finally {
        inFlight = false;
      }
    }

    if ('EventSource' in window) {
      eventSource = new EventSource('/api/realtime/events?topics=inbox,notifications');
      eventSource.addEventListener('digest', (event) => {
        sseHealthy = true;
        const signature = event instanceof MessageEvent ? event.data : '';
        if (!signature) return;
        if (lastSignature === null) {
          lastSignature = signature;
          return;
        }
        if (signature !== lastSignature) {
          lastSignature = signature;
          router.refresh();
        }
      });
      eventSource.onerror = () => {
        sseHealthy = false;
      };
    }

    void checkSelectedConversation();
    const timer = window.setInterval(() => {
      if (!sseHealthy) void checkSelectedConversation();
    }, intervalMs);

    return () => {
      eventSource?.close();
      window.clearInterval(timer);
    };
  }, [intervalMs, router]);

  return null;
}
