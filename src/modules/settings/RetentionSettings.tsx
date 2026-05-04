'use client';

import { useState, useEffect } from 'react';

export function RetentionSettings() {
  const [exportsDays, setExportsDays] = useState('30');
  const [auditDays, setAuditDays] = useState('90');
  const [mediaDays, setMediaDays] = useState('60');
  const [chatDays, setChatDays] = useState('30');
  const [conversationsDays, setConversationsDays] = useState('90');
  const [orphaned, setOrphaned] = useState('true');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings/retention')
      .then(r => r.json())
      .then(d => {
        if (d.exportsDays) setExportsDays(d.exportsDays);
        if (d.auditDays) setAuditDays(d.auditDays);
        if (d.mediaDays) setMediaDays(d.mediaDays);
        if (d.chatDays) setChatDays(d.chatDays);
        if (d.conversationsDays) setConversationsDays(d.conversationsDays);
        if (d.orphanedCleanup) setOrphaned(d.orphanedCleanup);
      })
      .catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('exportsDays', exportsDays);
      fd.append('auditDays', auditDays);
      fd.append('mediaDays', mediaDays);
      fd.append('chatDays', chatDays);
      fd.append('conversationsDays', conversationsDays);
      fd.append('orphanedCleanup', orphaned);
      const res = await fetch('/api/settings/retention', { method: 'POST', body: fd });
      const data = await res.json() as { ok?: boolean };
      setResult(data.ok ? 'Configuración guardada.' : 'Error.');
    } catch {
      setResult('Error.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="text-muted" style={{ fontSize: '0.8rem' }}>
        Los datos más antiguos que el período configurado se eliminarán automáticamente cada 24 horas.
        Poner 0 desactiva la limpieza de ese tipo.
      </p>
      <form onSubmit={save} className="stack" style={{ gap: 8, maxWidth: 400 }}>
        <label>
          <span>Exportaciones ZIP (días)</span>
          <input type="number" min="0" value={exportsDays} onChange={e => setExportsDays(e.target.value)} />
        </label>
        <label>
          <span>Registros de auditoría (días)</span>
          <input type="number" min="0" value={auditDays} onChange={e => setAuditDays(e.target.value)} />
        </label>
        <label>
          <span>Archivos multimedia no archivados (días)</span>
          <input type="number" min="0" value={mediaDays} onChange={e => setMediaDays(e.target.value)} />
        </label>
        <label>
          <span>Chat interno (días)</span>
          <input type="number" min="0" value={chatDays} onChange={e => setChatDays(e.target.value)} />
        </label>
        <label>
          <span>Conversaciones WhatsApp (días)</span>
          <input type="number" min="0" value={conversationsDays} onChange={e => setConversationsDays(e.target.value)} />
        </label>
        <label className="checkbox" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={orphaned === 'true'} onChange={e => setOrphaned(e.target.checked ? 'true' : 'false')} />
          Limpiar archivos huérfanos y carpetas vacías
        </label>
        <button type="submit" className="compact-action-button" disabled={loading}>
          {loading ? 'Guardando…' : 'Guardar retención'}
        </button>
        {result && <small style={{ color: result.includes('Error') ? '#dc2626' : '#166534' }}>{result}</small>}
      </form>
    </div>
  );
}
