'use client';

import { useEffect, useState } from 'react';

const COMMON_TZ = [
  'America/Guatemala',
  'America/Mexico_City',
  'America/Argentina/Buenos_Aires',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/Caracas',
  'America/La_Paz',
  'America/Asuncion',
  'America/Montevideo',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/Madrid',
  'UTC',
];

export function TimezoneSelector() {
  const [timezone, setTimezone] = useState('');
  const [effective, setEffective] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [resultType, setResultType] = useState<'success' | 'error'>('success');

  useEffect(() => {
    fetch('/api/settings/timezone')
      .then((r) => r.json())
      .then((d: { timezone?: string; effective?: string }) => {
        setTimezone(d.timezone ?? d.effective ?? 'America/Guatemala');
        setEffective(d.effective ?? 'America/Guatemala');
      })
      .catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setResult(null);

    try {
      const res = await fetch('/api/settings/timezone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

      if (res.ok && data?.ok) {
        setResult(
          `Zona horaria guardada: ${timezone}. Recargue la página para aplicar los cambios.`,
        );
        setResultType('success');
        setEffective(timezone);
      } else {
        setResult(data?.error || 'Error al guardar');
        setResultType('error');
      }
    } catch {
      setResult('Error de conexión');
      setResultType('error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="stack" style={{ gap: 8, maxWidth: 400 }}>
      <label>
        <span>Zona horaria</span>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          style={{ width: '100%' }}
        >
          {COMMON_TZ.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        <small style={{ color: '#9ca3af' }}>
          {effective ? `Actual: ${effective}` : 'Cargando…'}
        </small>
      </label>
      <button type="submit" className="compact-action-button" disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar zona horaria'}
      </button>
      {result && (
        <small style={{ color: resultType === 'error' ? '#dc2626' : '#166534' }}>{result}</small>
      )}
    </form>
  );
}
