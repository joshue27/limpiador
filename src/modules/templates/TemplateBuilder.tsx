'use client';

import { useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';

const categoryOptions = [
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'UTILITY', label: 'Utilidad' },
  { value: 'AUTHENTICATION', label: 'Autenticación' },
];

const headerFormats = [
  { value: 'TEXT', label: 'Texto' },
  { value: 'IMAGE', label: 'Imagen' },
  { value: 'VIDEO', label: 'Video' },
  { value: 'DOCUMENT', label: 'Documento' },
];

type ButtonDef = { text: string; type: 'QUICK_REPLY' | 'URL'; url?: string };

type EditTemplate = {
  name: string;
  language: string;
  category: string;
  body: string;
  header?: string | null;
  footer?: string | null;
};

export function TemplateBuilder({ editTemplate }: { editTemplate?: EditTemplate }) {
  const router = useRouter();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [name, setName] = useState(editTemplate?.name ?? '');
  const [language, setLanguage] = useState(editTemplate?.language ?? 'es');
  const [category, setCategory] = useState(editTemplate?.category ?? 'MARKETING');
  const [headerFormat, setHeaderFormat] = useState('TEXT');
  const [headerText, setHeaderText] = useState(editTemplate?.header ?? '');
  const [headerUrl, setHeaderUrl] = useState('');
  const [body, setBody] = useState(editTemplate?.body ?? '');
  const [footer, setFooter] = useState(editTemplate?.footer ?? '');
  const [buttons, setButtons] = useState<ButtonDef[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [samples, setSamples] = useState<Record<string, string>>({});

  const contactFields = [
    { label: 'Nombre', field: 'displayName', description: 'Nombre del contacto' },
    { label: 'Teléfono', field: 'phone', description: 'Número de teléfono' },
    { label: 'WA ID', field: 'waId', description: 'Identificador de WhatsApp' },
  ];

  const variables = useMemo(() => {
    const matches = body.match(/\{\{(\d+)\}\}/g) ?? [];
    return [...new Set(matches)].sort();
  }, [body]);

  function updateSample(key: string, value: string) {
    setSamples((prev) => ({ ...prev, [key]: value }));
  }

  function insertVariable() {
    const textarea = bodyRef.current;
    if (!textarea) return;

    // Find the next available variable number
    const existing = body.match(/\{\{(\d+)\}\}/g) ?? [];
    const nums = existing.map((v) => Number(v.replace(/\D/g, '')));
    const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    const variable = `{{${nextNum}}}`;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = body.slice(0, start);
    const after = body.slice(end);
    const newBody = before + variable + after;

    setBody(newBody);

    // Restore cursor position after React re-render
    requestAnimationFrame(() => {
      textarea.focus();
      const newPos = start + variable.length;
      textarea.setSelectionRange(newPos, newPos);
    });
  }

  function addButton() {
    if (buttons.length >= 3) return;
    setButtons([...buttons, { text: '', type: 'QUICK_REPLY' }]);
  }

  function updateButton(index: number, field: keyof ButtonDef, value: string) {
    setButtons(buttons.map((b, i) => i === index ? { ...b, [field]: value } : b));
  }

  function removeButton(index: number) {
    setButtons(buttons.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const safeName = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!safeName || !body.trim()) {
      setError('El nombre y el cuerpo son obligatorios.');
      setSaving(false);
      return;
    }

    try {
      const res = await fetch('/api/templates/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: safeName,
          language,
          category,
          headerFormat: headerText.trim() || headerUrl.trim() ? headerFormat : undefined,
          headerText: headerText.trim() || undefined,
          headerUrl: headerUrl.trim() || undefined,
          body: body.trim(),
          footer: footer.trim() || undefined,
          buttons: buttons.filter((b) => b.text.trim()).map((b) => ({ text: b.text.trim(), type: b.type, url: b.type === 'URL' ? b.url?.trim() || undefined : undefined })),
        }),
      });
      const result = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !result.ok) {
        setError(result.error ?? 'Error al crear la plantilla.');
        return;
      }
      setSuccess('Plantilla creada y enviada a Meta para aprobación.');
      setName('');
      setHeaderText('');
      setHeaderUrl('');
      setBody('');
      setFooter('');
      setButtons([]);
      setSamples({});
      router.refresh();
    } catch {
      setError('Error de conexión al crear la plantilla.');
    } finally {
      setSaving(false);
    }
  }

  const previewBody = (() => {
    let text = body || 'Cuerpo del mensaje.';
    for (const v of variables) {
      const sample = samples[v]?.trim();
      text = text.replaceAll(v, sample || v);
    }
    return text;
  })();

  const hasHeader = Boolean(headerText.trim() || headerUrl.trim());

  return (
    <div className="template-builder">
      <form onSubmit={handleSubmit} className="template-form">
        <div className="template-meta-row">
          <label>
            <span>Nombre</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="saludo_bienvenida" required />
          </label>
          <label>
            <span>Idioma</span>
            <input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="es" required />
          </label>
          <label>
            <span>Categoría</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categoryOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
        </div>

        <fieldset className="template-section">
          <legend>Encabezado (opcional)</legend>
          <div className="template-meta-row">
            <label>
              <span>Tipo</span>
              <select value={headerFormat} onChange={(e) => setHeaderFormat(e.target.value)}>
                {headerFormats.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </label>
            {headerFormat === 'TEXT' ? (
              <label style={{ gridColumn: 'span 2' }}>
                <span>Texto del encabezado</span>
                <input value={headerText} onChange={(e) => setHeaderText(e.target.value)} placeholder="Oferta especial para vos" />
              </label>
            ) : (
              <label style={{ gridColumn: 'span 2' }}>
                <span>URL del medio (Meta la descarga al crear)</span>
                <input value={headerUrl} onChange={(e) => setHeaderUrl(e.target.value)} placeholder="https://ejemplo.com/imagen.jpg" />
              </label>
            )}
          </div>
        </fieldset>

        <fieldset className="template-section">
          <legend>Cuerpo</legend>
          <label>
            <span>Texto del mensaje</span>
            <div className="template-variable-pills">
              {contactFields.map((field) => (
                <button
                  key={field.label}
                  type="button"
                  className="template-variable-pill"
                  title={field.description}
                  onClick={insertVariable}
                >
                  + {field.label}
                </button>
              ))}
            </div>
            <textarea ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} placeholder={"Hola {{1}}, tu consulta sobre {{2}} fue recibida. Te contactaremos pronto."} rows={3} required />
          </label>
          <small>Usá {'{{1}}'}, {'{{2}}'}, {'{{3}}'} para variables. Las pills insertan el siguiente número disponible.<br />
          {'{{1}}'} = Nombre · {'{{2}}'} = Teléfono · {'{{3}}'} = WA ID</small>
          {variables.length > 0 && (
            <div className="template-variables">
              <span className="template-variables-label">Valores de muestra para vista previa</span>
              <div className="template-meta-row">
                {variables.map((v) => (
                  <label key={v}>
                    <span>{v}</span>
                    <input
                      value={samples[v] ?? ''}
                      onChange={(e) => updateSample(v, e.target.value)}
                      placeholder={`Ej: ${v === '{{1}}' ? 'Juan' : v === '{{2}}' ? '1234' : 'valor'}`}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </fieldset>

        <fieldset className="template-section">
          <legend>Pie de página (opcional)</legend>
          <label>
            <span>Texto</span>
            <input value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="Gracias por confiar en nosotros." />
          </label>
        </fieldset>

        <fieldset className="template-section">
          <legend>Botones (hasta 3)</legend>
          {buttons.map((btn, i) => (
            <div key={i} className="template-button-row">
              <div className="template-meta-row">
                <label>
                  <span>Texto</span>
                  <input value={btn.text} onChange={(e) => updateButton(i, 'text', e.target.value)} placeholder="Botón" />
                </label>
                <label>
                  <span>Tipo</span>
                  <select value={btn.type} onChange={(e) => updateButton(i, 'type', e.target.value as 'QUICK_REPLY' | 'URL')}>
                    <option value="QUICK_REPLY">Respuesta rápida</option>
                    <option value="URL">Enlace</option>
                  </select>
                </label>
                {btn.type === 'URL' && (
                  <label>
                    <span>URL</span>
                    <input value={btn.url ?? ''} onChange={(e) => updateButton(i, 'url', e.target.value)} placeholder="https://" />
                  </label>
                )}
              </div>
              <button type="button" className="button-secondary compact-action-button" onClick={() => removeButton(i)}>Quitar</button>
            </div>
          ))}
          {buttons.length < 3 && (
            <button type="button" className="button-secondary" onClick={addButton}>＋ Agregar botón</button>
          )}
        </fieldset>

        <div className="template-actions">
          <button type="submit" className="compact-action-button" disabled={saving}>
            {saving ? 'Enviando a Meta…' : 'Crear y enviar a Meta'}
          </button>
        </div>

        {error && <p className="notice notice-error">{error}</p>}
        {success && <p className="notice">{success}</p>}
      </form>

      <div className="template-preview">
        <p className="template-preview-label">Vista previa</p>
        <div className="template-preview-phone">
          <div className="template-preview-header">
            <span className="template-preview-name">{name || 'plantilla'}</span>
          </div>
          {hasHeader && (
            <div className="template-preview-section template-preview-section-header">
              {headerFormat === 'TEXT' ? (
                <strong>{headerText || 'Encabezado'}</strong>
              ) : headerUrl.trim() ? (
                <div className="template-preview-media">
                  <img src={headerUrl} alt="" className="template-preview-header-img" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <span>{headerFormat === 'IMAGE' ? '🖼 Imagen' : headerFormat === 'VIDEO' ? '🎬 Video' : '📄 Documento'}</span>
                </div>
              ) : (
                <div className="template-preview-media">📎 {headerFormat === 'IMAGE' ? 'Imagen' : headerFormat === 'VIDEO' ? 'Video' : 'Documento'}</div>
              )}
            </div>
          )}
          <div className="template-preview-section">
            <p>{previewBody}</p>
          </div>
          {footer.trim() && (
            <div className="template-preview-section template-preview-section-footer">
              <small>{footer}</small>
            </div>
          )}
          {buttons.length > 0 && (
            <div className="template-preview-section template-preview-buttons">
              {buttons.filter((b) => b.text.trim()).map((btn, i) => (
                <div key={i} className="template-preview-button">
                  {btn.type === 'URL' ? '🔗' : '↩'} {btn.text || 'Botón'}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
