'use client';

import { useState, useEffect } from 'react';

import { StorageBrowser } from '@/modules/settings/StorageBrowser';

type DriveSettingsProps = {
  notice?: string | null;
  noticeType?: 'success' | 'error';
};

export function DriveSettings({ notice = null, noticeType = 'success' }: DriveSettingsProps) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [folderId, setFolderId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(notice);
  const [resultType, setResultType] = useState<'success' | 'error'>(noticeType);
  const [configured, setConfigured] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [clientSecretConfigured, setClientSecretConfigured] = useState(false);
  const [refreshTokenConfigured, setRefreshTokenConfigured] = useState(false);
  const [oauthCallbackUrl, setOauthCallbackUrl] = useState('');

  useEffect(() => {
    setResult(notice);
    setResultType(noticeType);
  }, [notice, noticeType]);

  useEffect(() => {
    fetch('/api/settings/drive')
      .then(r => r.json())
      .then(d => {
        setClientId(d.clientId || '');
        setFolderId(d.folderId || '');
        setConfigured(Boolean(d.configured));
        setClientSecret('');
        setRefreshToken('');
        setClientSecretConfigured(Boolean(d.clientSecretConfigured));
        setRefreshTokenConfigured(Boolean(d.refreshTokenConfigured));
        setOauthCallbackUrl(d.oauthCallbackUrl || '');
      })
      .catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('clientId', clientId);
      fd.append('clientSecret', clientSecret);
      fd.append('refreshToken', refreshToken);
      fd.append('folderId', folderId);
      const res = await fetch('/api/settings/drive', { method: 'POST', body: fd });
      const data = await res.json() as { ok?: boolean };
      setResult(data.ok ? 'Configuración guardada.' : 'Error.');
      setResultType(data.ok ? 'success' : 'error');
      if (data.ok) {
        const nextClientSecretConfigured = Boolean(clientSecret || clientSecretConfigured);
        const nextRefreshTokenConfigured = Boolean(refreshToken || refreshTokenConfigured);

        setConfigured(Boolean(clientId && nextClientSecretConfigured && nextRefreshTokenConfigured));
        setClientSecretConfigured(nextClientSecretConfigured);
        setRefreshTokenConfigured(nextRefreshTokenConfigured);
        setClientSecret('');
        setRefreshToken('');
      }
    } catch {
      setResult('Error de conexión.');
      setResultType('error');
    } finally {
      setLoading(false);
    }
  }

  async function backupNow() {
    setBackingUp(true);
    setResult(null);
    try {
      const res = await fetch('/api/settings/drive/backup', { method: 'POST' });
      const data = await res.json() as { ok?: boolean; error?: string };
      setResult(data.ok ? 'Backup completado y subido a Drive.' : (data.error || 'Error al hacer backup.'));
      setResultType(data.ok ? 'success' : 'error');
    } catch {
      setResult('Error de conexión.');
      setResultType('error');
    } finally {
      setBackingUp(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="settings-info-grid">
        <div className="settings-info-box" style={{ borderLeft: configured ? '3px solid #10b981' : '3px solid #f59e0b' }}>
          <strong>{configured ? '✅ Google Drive configurado' : '⚠️ Google Drive no configurado'}</strong>
          <p style={{ fontSize: '0.8rem', margin: '4px 0 0' }}>
            {configured
              ? 'Las exportaciones diarias se subirán automáticamente a Google Drive.'
              : 'Las exportaciones automáticas a Drive no estarán activas.'}
          </p>
        </div>
      </div>
      <form onSubmit={save} className="stack" style={{ gap: 8, maxWidth: 400 }}>
        <label>
          <span>Client ID (OAuth)</span>
          <input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="Tu client ID de Google OAuth" />
        </label>
        <label>
          <span>Client Secret</span>
          <input value={clientSecret} onChange={e => setClientSecret(e.target.value)} placeholder={clientSecretConfigured ? 'Ya configurado. Ingresá uno nuevo solo para cambiarlo.' : 'Tu client secret de Google OAuth'} />
        </label>
        <label>
          <span>Refresh Token</span>
          <textarea value={refreshToken} onChange={e => setRefreshToken(e.target.value)} placeholder={refreshTokenConfigured ? 'Ya configurado. Ingresá uno nuevo solo para cambiarlo.' : 'Tu refresh token de Google OAuth'} rows={3} style={{ fontSize: '0.7rem', fontFamily: 'monospace' }} />
        </label>
        <div className="stack" style={{ gap: 6 }}>
          <button type="button" className="compact-action-button" onClick={() => { window.location.href = '/api/settings/drive/connect'; }}>
            Conectar Google Drive
          </button>
          <small style={{ color: '#9ca3af' }}>
            Guardá primero el client ID y client secret. Este botón abre Google, vuelve al callback de la app y guarda el refresh token automáticamente.
          </small>
          {oauthCallbackUrl && (
            <small style={{ color: '#9ca3af', fontFamily: 'monospace' }}>
              Redirect URI a registrar en Google Cloud: {oauthCallbackUrl}
            </small>
          )}
        </div>
        <label>
          <span>Folder ID (opcional)</span>
          <input value={folderId} onChange={e => setFolderId(e.target.value)} placeholder="ID de la carpeta raíz en Drive" />
        </label>
        <small style={{ color: '#9ca3af' }}>
          El folder ID sigue siendo manual. Si lo dejás vacío, se usa la raíz de Drive.
        </small>
        <button type="submit" className="compact-action-button" disabled={loading}>
          {loading ? 'Guardando…' : 'Guardar configuración'}
        </button>
        {configured && (
          <button type="button" className="compact-action-button" onClick={backupNow} disabled={backingUp} style={{ background: '#7c3aed', borderColor: '#6d28d9' }}>
            {backingUp ? 'Respaldando…' : 'Respaldar y subir ahora'}
          </button>
        )}
        <StorageBrowser />
        {result && <small style={{ color: resultType === 'error' ? '#dc2626' : '#166534' }}>{result}</small>}
      </form>
    </div>
  );
}
