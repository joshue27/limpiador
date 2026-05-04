'use client';

import { useState, useRef, useEffect } from 'react';

function BrandUpload({ label, type, hint, accept }: { label: string; type: string; hint: string; accept: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', type);
      const res = await fetch('/api/settings/branding', { method: 'POST', body: fd });
      const data = await res.json() as { ok?: boolean; error?: string };
      setResult(data.ok ? 'Guardado.' : (data.error || 'Error.'));
      if (data.ok) setFile(null);
    } catch {
      setResult('Error de conexión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <strong style={{ fontSize: '0.85rem' }}>{label}</strong>
      <p className="text-muted" style={{ margin: '2px 0 6px' }}>{hint}</p>
      <input ref={inputRef} type="file" accept={accept} onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ display: 'none' }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" className="button-secondary" onClick={() => inputRef.current?.click()} style={{ fontSize: '0.8rem' }}>
          {file ? file.name : 'Seleccionar archivo'}
        </button>
        {file && (
          <button type="button" className="compact-action-button" onClick={upload} disabled={loading} style={{ fontSize: '0.8rem' }}>
            {loading ? 'Guardando…' : 'Guardar'}
          </button>
        )}
      </div>
      {result && <small style={{ color: result === 'Guardado.' ? '#166534' : '#dc2626' }}>{result}</small>}
    </div>
  );
}

export function BrandingUploader() {
  const [sidebarColor, setSidebarColor] = useState('#1f2937');
  const [accentColor, setAccentColor] = useState('var(--accent, #075e54)');
  const [colorResult, setColorResult] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings/branding')
      .then(r => r.json())
      .then(d => {
        if (d.sidebarColor) setSidebarColor(d.sidebarColor);
        if (d.accentColor) setAccentColor(d.accentColor);
      })
      .catch(() => {});
  }, []);

  async function saveColor(type: string, value: string) {
    setColorResult(null);
    try {
      const fd = new FormData();
      fd.append(type, value);
      const res = await fetch('/api/settings/branding', { method: 'POST', body: fd });
      const data = await res.json() as { ok?: boolean };
      setColorResult(data.ok ? 'Color guardado.' : 'Error.');
    } catch {
      setColorResult('Error.');
    }
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div>
        <strong style={{ fontSize: '0.85rem' }}>Color del sidebar</strong>
        <p className="text-muted" style={{ margin: '2px 0 6px' }}>Fondo del menú lateral.</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="color" value={sidebarColor} onChange={(e) => setSidebarColor(e.target.value)} style={{ width: 40, height: 32, border: 'none', cursor: 'pointer' }} />
          <input type="text" value={sidebarColor} onChange={(e) => setSidebarColor(e.target.value)} style={{ fontSize: '0.8rem', width: 100 }} />
          <button type="button" className="compact-action-button" onClick={() => saveColor('sidebarColor', sidebarColor)} style={{ fontSize: '0.8rem' }}>Aplicar</button>
        </div>
      </div>
      <div>
        <strong style={{ fontSize: '0.85rem' }}>Color de acento</strong>
        <p className="text-muted" style={{ margin: '2px 0 6px' }}>Botones principales en todo el sistema.</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} style={{ width: 40, height: 32, border: 'none', cursor: 'pointer' }} />
          <input type="text" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} style={{ fontSize: '0.8rem', width: 100 }} />
          <button type="button" className="compact-action-button" onClick={() => saveColor('accentColor', accentColor)} style={{ fontSize: '0.8rem' }}>Aplicar</button>
        </div>
      </div>
      {colorResult && <small style={{ color: colorResult === 'Color guardado.' ? '#166534' : '#dc2626' }}>{colorResult}</small>}
      <BrandUpload label="Logo" type="logo" hint="Aparece en el sidebar y en el login. Recomendado: PNG, 200×50px." accept="image/png,image/svg+xml" />
      <BrandUpload label="Fondo del login" type="background" hint="Imagen de fondo para el inicio de sesión. Recomendado: JPG, 1920×1080px." accept="image/jpeg,image/png,image/webp" />
      <BrandUpload label="Favicon" type="favicon" hint="Ícono de la pestaña. Recomendado: ICO/PNG, 32×32px." accept="image/x-icon,image/png,image/vnd.microsoft.icon" />
    </div>
  );
}
