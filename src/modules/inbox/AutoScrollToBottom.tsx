'use client';

import { useEffect, useRef } from 'react';

export default function AutoScrollToBottom({ watchKey }: { watchKey?: string | number }) {
  const wasNearBottom = useRef(true);

  useEffect(() => {
    const container = document.querySelector('.message-history .messages');
    if (!container) return;

    const handleScroll = () => {
      const sb = container.scrollHeight - container.scrollTop - container.clientHeight;
      wasNearBottom.current = sb < 120;
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    // Only auto-scroll if user was already near the bottom
    if (!wasNearBottom.current) return;

    const container = document.querySelector('.message-history .messages');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [watchKey]);

  return null;
}
