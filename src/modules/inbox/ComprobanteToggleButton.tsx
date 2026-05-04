'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ComprobanteToggleButton({ mediaAssetId, initialMarked }: { mediaAssetId: string; initialMarked: boolean }) {
  const router = useRouter();
  const [marked, setMarked] = useState(initialMarked);
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    try {
      const response = await fetch(`/api/media/${mediaAssetId}/comprobante`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isComprobante: !marked }),
      });

      if (!response.ok) return;

      setMarked((current) => !current);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      className={marked ? 'button-secondary compact-action-button comprobante-marked' : 'button-secondary compact-action-button'}
      disabled={pending}
      onClick={() => void toggle()}
    >
      {pending ? 'Guardando…' : marked ? '✓ Archivado' : 'Archivar'}
    </button>
  );
}
