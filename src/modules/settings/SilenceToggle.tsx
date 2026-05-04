'use client';

import { useState } from 'react';

export function SilenceToggle() {
  const [muted, setMuted] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('notifications-muted') === 'true';
  });

  function toggle() {
    const next = !muted;
    setMuted(next);
    localStorage.setItem('notifications-muted', String(next));
  }

  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem' }}>
      <input type="checkbox" checked={muted} onChange={toggle} />
      Silenciar notificaciones y tonos
    </label>
  );
}
