'use client';

import { useState } from 'react';

type Props = {
  templateId: string;
  templateName: string;
  available: boolean;
};

export function TemplateActions({ templateId, templateName, available }: Props) {
  const [showDelete, setShowDelete] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function toggleAvailable() {
    setToggling(true);
    try {
      await fetch(`/api/templates/${templateId}/toggle-available`, { method: 'POST' });
      window.location.reload();
    } catch {
      setToggling(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 4, position: 'relative' }}>
      <a href={`/templates?copy=${templateId}`} style={{ fontSize: '0.7rem', padding: '2px 8px', textDecoration: 'none', background: 'var(--accent, #075e54)', color: '#fff', border: '1px solid var(--accent, #064e3b)', borderRadius: 2, fontWeight: 650, display: 'inline-block' }}>Copiar</a>
      <button
        type="button"
        className="button-secondary"
        style={{ fontSize: '0.7rem', padding: '2px 6px' }}
        onClick={toggleAvailable}
        disabled={toggling}
      >
        {available ? '✓ Disponible' : '✗ Oculto'}
      </button>
      <button
        type="button"
        className="button-danger"
        style={{ fontSize: '0.7rem', padding: '2px 6px' }}
        onClick={() => setShowDelete(!showDelete)}
      >
        Eliminar
      </button>
      {showDelete && (
        <div className="popover popover-delete">
          <p>¿Eliminar &quot;{templateName}&quot;?</p>
          <div style={{ display: 'flex', gap: 4 }}>
            <form action={`/api/templates/${templateId}/delete`} method="post">
              <button type="submit" className="button-danger" style={{ fontSize: '0.7rem' }}>Sí, eliminar</button>
            </form>
            <button type="button" className="button-secondary" style={{ fontSize: '0.7rem' }} onClick={() => setShowDelete(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
