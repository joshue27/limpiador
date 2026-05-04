'use client';

import { useState, useEffect } from 'react';

export function SmtpSettings() {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [from, setFrom] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    fetch('/api/settings/smtp')
      .then(r => r.json())
      .then(d => {
        if (d.host) { setHost(d.host); setPort(d.port || '587'); setUser(d.user || ''); setFrom(d.from || ''); setConfigured(true); }
      })
      .catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('host', host);
      fd.append('port', port);
      fd.append('user', user);
      if (pass) fd.append('pass', pass);
      fd.append('from', from);
      const res = await fetch('/api/settings/smtp', { method: 'POST', body: fd });
      const data = await res.json() as { ok?: boolean };
      setResult(data.ok ? 'Configuración guardada.' : 'Error.');
      if (data.ok) setConfigured(true);
    } catch {
      setResult('Error de conexión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="settings-info-grid">
        <div className="settings-info-box" style={{ borderLeft: configured ? '3px solid #10b981' : '3px solid #f59e0b' }}>
          <strong>{configured ? '✅ SMTP configurado' : '⚠️ SMTP no configurado'}</strong>
          <p style={{ fontSize: '0.8rem', margin: '4px 0 0' }}>
            {configured
              ? 'Verificación por email, recuperación de contraseña y notificaciones activos.'
              : 'Los siguientes servicios no estarán disponibles: verificación semanal, recuperación de contraseña, notificaciones por email de conversaciones asignadas.'}
          </p>
        </div>
      </div>
      <form onSubmit={save} className="stack" style={{ gap: 8, maxWidth: 400 }}>
        <label>
          <span>Servidor SMTP</span>
          <input value={host} onChange={e => setHost(e.target.value)} placeholder="smtp.gmail.com" />
        </label>
        <label>
          <span>Puerto</span>
          <input value={port} onChange={e => setPort(e.target.value)} placeholder="587" />
        </label>
        <label>
          <span>Usuario</span>
          <input value={user} onChange={e => setUser(e.target.value)} placeholder="tu-email@gmail.com" />
        </label>
        <label>
          <span>Contraseña (de aplicación)</span>
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Dejar vacío para no cambiar" />
        </label>
        <label>
          <span>Remitente (From)</span>
          <input value={from} onChange={e => setFrom(e.target.value)} placeholder="noreply@limpiador.app" />
        </label>
        <button type="submit" className="compact-action-button" disabled={loading}>
          {loading ? 'Guardando…' : 'Guardar configuración'}
        </button>
        {result && <small style={{ color: result.includes('Error') ? '#dc2626' : '#166534' }}>{result}</small>}
      </form>
    </div>
  );
}
