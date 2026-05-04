'use client';

import { useState, useEffect } from 'react';

export function RoutingMenuEditor() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings/routing-menu')
      .then(r => r.json())
      .then(d => { setText(d.text || ''); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch('/api/settings/routing-menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (res.ok) setResult('Menú guardado.');
      else setResult('Error al guardar.');
    } catch {
      setResult('Error de conexión.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-muted">Cargando...</p>;

  return (
    <div className="stack" style={{ gap: 8 }}>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={8}
        style={{ width: '100%', maxWidth: 500, fontFamily: 'monospace', fontSize: '0.8rem' }}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" className="compact-action-button" onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar menú'}
        </button>
        {result && <small>{result}</small>}
      </div>
    </div>
  );
}
