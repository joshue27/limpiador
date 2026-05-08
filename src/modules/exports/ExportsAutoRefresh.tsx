'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export function ExportsAutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  const lastDigest = useRef('');

  useEffect(() => {
    async function check() {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch('/api/exports/status', { headers: { Accept: 'application/json' }, cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json() as { digest?: string };
        if (!data.digest) return;
        if (!lastDigest.current) { lastDigest.current = data.digest; return; }
        if (data.digest !== lastDigest.current) {
          lastDigest.current = data.digest;
          router.refresh();
        }
      } catch { /* ignore */ }
    }
    void check();
    const timer = window.setInterval(() => void check(), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, router]);

  return null;
}
