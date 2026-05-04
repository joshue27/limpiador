'use client';

import { useState } from 'react';
import { CsvUploader } from './CsvUploader';

type Props = {
  campaignId: string;
  campaignName: string;
  status: string;
  totalRecipients: number;
  sent: number;
  failed: number;
  placeholders: string[];
  placeholderMap: Record<string, string>;
  csvHeaders: string[];
};

export function CampaignRow({
  campaignId,
  campaignName,
  status,
  totalRecipients,
  sent,
  failed,
  placeholders,
  placeholderMap,
  csvHeaders,
}: Props) {
  const [showDelete, setShowDelete] = useState(false);
  const [showAddContacts, setShowAddContacts] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showVariables, setShowVariables] = useState(false);

  // Format datetime-local value (YYYY-MM-DDTHH:MM)
  const now = new Date();
  now.setMinutes(now.getMinutes() + 5);
  const defaultSchedule = now.toISOString().slice(0, 16);

  return (
    <>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', position: 'relative' }}>
        {status === 'DRAFT' && (
          <button
            type="button"
            className="button-secondary"
            style={{ fontSize: '0.7rem', padding: '2px 6px' }}
            onClick={() => setShowAddContacts(!showAddContacts)}
          >
            {showAddContacts ? 'Cerrar' : '+ Contactos'}
          </button>
        )}
        {status === 'DRAFT' && placeholders.length > 0 && (
          <button
            type="button"
            className="button-secondary"
            style={{ fontSize: '0.7rem', padding: '2px 6px' }}
            onClick={() => setShowVariables(!showVariables)}
          >
            {showVariables ? 'Cerrar variables' : 'Variables'}
          </button>
        )}
        {status === 'DRAFT' && totalRecipients > 0 && (
          <>
            <form action={`/api/campaigns/${campaignId}/launch`} method="post">
              <button type="submit" className="compact-action-button" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>Lanzar ahora</button>
            </form>
            <button
              type="button"
              className="button-secondary"
              style={{ fontSize: '0.7rem', padding: '2px 6px' }}
              onClick={() => setShowSchedule(!showSchedule)}
            >
              {showSchedule ? 'Cancelar' : 'Programar'}
            </button>
          </>
        )}
        {showSchedule && (
          <form action={`/api/campaigns/${campaignId}/launch`} method="post" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="datetime-local" name="scheduledAt" defaultValue={defaultSchedule} required style={{ fontSize: '0.7rem', padding: '2px 4px' }} />
            <button type="submit" className="compact-action-button" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>Programar</button>
          </form>
        )}
        <div style={{ position: 'relative' }}>
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
              <p>¿Eliminar &quot;{campaignName}&quot;?</p>
              <div style={{ display: 'flex', gap: 4 }}>
                <form action={`/api/campaigns/${campaignId}/delete`} method="post">
                  <button type="submit" className="button-danger" style={{ fontSize: '0.7rem' }}>Sí, eliminar</button>
                </form>
                <button type="button" className="button-secondary" style={{ fontSize: '0.7rem' }} onClick={() => setShowDelete(false)}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      </div>
      {showAddContacts && (
        <div className="popover popover-add-contacts">
          <CsvUploader campaignId={campaignId} compact />
        </div>
      )}
      {showVariables && (
        <div className="popover popover-add-contacts" style={{ minWidth: 320 }}>
          <form action={`/api/campaigns/${campaignId}/placeholder-map`} method="post" className="stack" style={{ gap: 8 }}>
            <strong>Mapeo de variables</strong>
            <small>
              Vinculá cada placeholder del template con una columna del CSV. Si dejás vacío, {'{{1}}'} usa nombre y {'{{2}}'} usa teléfono.
            </small>
            {placeholders.map((placeholder) => (
              <label key={placeholder} className="stack" style={{ gap: 4 }}>
                <span>{`{{${placeholder}}}`}</span>
                <select name={`placeholder_${placeholder}`} defaultValue={placeholderMap[String(placeholder)] ?? ''}>
                  <option value="">Usar default / vacío</option>
                  {csvHeaders.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <button type="submit" className="compact-action-button" style={{ fontSize: '0.75rem' }}>
              Guardar variables
            </button>
          </form>
        </div>
      )}
    </>
  );
}
