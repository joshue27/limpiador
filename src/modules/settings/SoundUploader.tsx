'use client';

import { useEffect, useState, useRef } from 'react';

import { initNotificationAudioUnlock, playNotificationSound } from '@/modules/notifications/audio';

function SoundRow({ label, type, hint }: { label: string; type: string; hint: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [resultType, setResultType] = useState<'success' | 'error'>('success');
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    setResultType('success');
    try {
      const fd = new FormData();
      fd.append('sound', file);
      fd.append('type', type);
      const res = await fetch('/api/settings/notification-sound', { method: 'POST', body: fd });
      setResult(res.ok ? 'Guardado.' : 'Error.');
      setResultType(res.ok ? 'success' : 'error');
    } catch {
      setResult('Error.');
      setResultType('error');
    } finally {
      setLoading(false);
    }
  }

  async function testSound() {
    setResult(null);
    setResultType('success');
    const soundFile =
      type === 'transfer' ? 'notification-transfer.mp3' : 'notification-message.mp3';
    const ok = await playNotificationSound(soundFile);
    setResult(ok ? 'Prueba reproducida.' : 'No se pudo reproducir el audio.');
    setResultType(ok ? 'success' : 'error');
  }

  return (
    <div>
      <strong style={{ fontSize: '0.85rem' }}>{label}</strong>
      <p className="text-muted" style={{ margin: '2px 0 6px' }}>
        {hint}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="audio/mp3,audio/wav,audio/mpeg"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        style={{ display: 'none' }}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="button-secondary"
          onClick={() => inputRef.current?.click()}
          style={{ fontSize: '0.8rem' }}
        >
          {file ? file.name : 'Seleccionar audio'}
        </button>
        {file && (
          <button
            type="button"
            className="compact-action-button"
            onClick={upload}
            disabled={loading}
            style={{ fontSize: '0.8rem' }}
          >
            {loading ? 'Guardando…' : 'Guardar'}
          </button>
        )}
        <button
          type="button"
          className="button-secondary"
          onClick={() => void testSound()}
          style={{ fontSize: '0.8rem' }}
        >
          Probar sonido
        </button>
      </div>
      {result && (
        <small style={{ color: resultType === 'success' ? '#166534' : '#dc2626' }}>{result}</small>
      )}
    </div>
  );
}

export function SoundUploader() {
  useEffect(() => {
    initNotificationAudioUnlock();
  }, []);

  return (
    <div className="stack" style={{ gap: 12 }}>
      <SoundRow
        label="Mensaje entrante"
        type="message"
        hint="Cuando recibís un mensaje nuevo de un cliente."
      />
      <SoundRow
        label="Chat transferido"
        type="transfer"
        hint="Cuando te asignan una conversación."
      />
    </div>
  );
}
