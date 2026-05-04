'use client';

import { useState, useEffect } from 'react';

interface WhatsappSettingsData {
  graphApiVersion?: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  accessTokenConfigured: boolean;
  appSecretConfigured: boolean;
  webhookVerifyTokenConfigured: boolean;
  webhookUrl: string;
}

export function WhatsappSettings() {
  const [graphApiVersion, setGraphApiVersion] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [webhookVerifyToken, setWebhookVerifyToken] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [accessTokenConfigured, setAccessTokenConfigured] = useState(false);
  const [appSecretConfigured, setAppSecretConfigured] = useState(false);
  const [webhookVerifyTokenConfigured, setWebhookVerifyTokenConfigured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings/whatsapp')
      .then(r => r.json())
      .then((d: WhatsappSettingsData) => {
        if (d.graphApiVersion) setGraphApiVersion(d.graphApiVersion);
        if (d.phoneNumberId) setPhoneNumberId(d.phoneNumberId);
        if (d.businessAccountId) setBusinessAccountId(d.businessAccountId);
        setWebhookUrl(d.webhookUrl || '');
        setAccessTokenConfigured(d.accessTokenConfigured);
        setAppSecretConfigured(d.appSecretConfigured);
        setWebhookVerifyTokenConfigured(d.webhookVerifyTokenConfigured);
      })
      .catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('graphApiVersion', graphApiVersion);
      fd.append('phoneNumberId', phoneNumberId);
      fd.append('businessAccountId', businessAccountId);
      if (accessToken) fd.append('accessToken', accessToken);
      if (appSecret) fd.append('appSecret', appSecret);
      if (webhookVerifyToken) fd.append('webhookVerifyToken', webhookVerifyToken);
      const res = await fetch('/api/settings/whatsapp', { method: 'POST', body: fd });
      const data = await res.json() as { ok?: boolean; webhookUrl?: string };
      setResult(data.ok ? 'Configuración guardada.' : 'Error.');
      if (data.ok) {
        if (data.webhookUrl) setWebhookUrl(data.webhookUrl);
        if (accessToken) setAccessTokenConfigured(true);
        if (appSecret) setAppSecretConfigured(true);
        if (webhookVerifyToken) setWebhookVerifyTokenConfigured(true);
        // Clear sensitive inputs after save
        setAccessToken('');
        setAppSecret('');
        setWebhookVerifyToken('');
      }
    } catch {
      setResult('Error de conexión.');
    } finally {
      setLoading(false);
    }
  }

  const indicator = (configured: boolean, label: string) => (
    <span className={`settings-indicator ${configured ? 'indicator-green' : 'indicator-red'}`}>
      {configured ? '🟢' : '🔴'} {label}
    </span>
  );

  return (
    <div className="stack" style={{ gap: 12 }}>
      {/* Webhook URL display */}
      {webhookUrl && (
        <div className="settings-info-grid">
          <div className="settings-info-box" style={{ borderLeft: '3px solid #3b82f6' }}>
            <strong>🔗 URL del Webhook</strong>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <code style={{ fontSize: '0.75rem', background: '#1e293b', color: '#e2e8f0', padding: '4px 8px', borderRadius: 4, wordBreak: 'break-all' }}>
                {webhookUrl}
              </code>
              <button
                type="button"
                className="button-secondary"
                style={{ fontSize: '0.7rem', padding: '2px 8px', whiteSpace: 'nowrap' }}
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl).catch(() => {});
                }}
              >
                Copiar
              </button>
            </div>
            <p style={{ fontSize: '0.75rem', margin: '6px 0 0', color: '#9ca3af' }}>
              Configurá esta URL en el dashboard de Meta Business como Webhook de WhatsApp.
            </p>
          </div>
        </div>
      )}

      {/* Configuration indicators */}
      <div className="settings-info-grid">
        <div className="settings-info-box" style={{ borderLeft: accessTokenConfigured && appSecretConfigured && webhookVerifyTokenConfigured ? '3px solid #10b981' : '3px solid #f59e0b' }}>
          <strong>
            {accessTokenConfigured && appSecretConfigured && webhookVerifyTokenConfigured
              ? '✅ WhatsApp configurado'
              : '⚠️ WhatsApp parcialmente configurado'}
          </strong>
          <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
            {indicator(accessTokenConfigured, 'Access Token')}
            {indicator(appSecretConfigured, 'App Secret')}
            {indicator(webhookVerifyTokenConfigured, 'Verify Token')}
          </div>
        </div>
      </div>

      <form onSubmit={save} className="stack" style={{ gap: 8, maxWidth: 400 }}>
        <label>
          <span>Graph API Version</span>
          <input value={graphApiVersion} onChange={e => setGraphApiVersion(e.target.value)} placeholder="v21.0" />
        </label>
        <label>
          <span>Phone Number ID</span>
          <input value={phoneNumberId} onChange={e => setPhoneNumberId(e.target.value)} placeholder="ID del número de teléfono" />
        </label>
        <label>
          <span>Business Account ID</span>
          <input value={businessAccountId} onChange={e => setBusinessAccountId(e.target.value)} placeholder="ID de la cuenta de negocio" />
        </label>
        <label>
          <span>Access Token</span>
          <input
            type="password"
            value={accessToken}
            onChange={e => setAccessToken(e.target.value)}
            placeholder={accessTokenConfigured ? '●●●●●●●●' : 'Token de acceso de Meta'}
          />
        </label>
        <label>
          <span>App Secret</span>
          <input
            type="password"
            value={appSecret}
            onChange={e => setAppSecret(e.target.value)}
            placeholder={appSecretConfigured ? '●●●●●●●●' : 'App Secret de Meta'}
          />
        </label>
        <label>
          <span>Webhook Verify Token</span>
          <input
            type="password"
            value={webhookVerifyToken}
            onChange={e => setWebhookVerifyToken(e.target.value)}
            placeholder={webhookVerifyTokenConfigured ? '●●●●●●●●' : 'Token de verificación del webhook'}
          />
        </label>
        <small style={{ color: '#9ca3af' }}>
          Dejá los campos de credenciales en blanco para conservar los valores actuales.
        </small>
        <button type="submit" className="compact-action-button" disabled={loading}>
          {loading ? 'Guardando…' : 'Guardar configuración'}
        </button>
        {result && <small style={{ color: result.includes('Error') ? '#dc2626' : '#166534' }}>{result}</small>}
      </form>
    </div>
  );
}
