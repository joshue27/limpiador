'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type ImportResult = {
  created: number;
  duplicates: number;
  rejectedCount: number;
};

export function CsvImporter() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(selected: File | null) {
    if (!selected) return;
    setImporting(true);
    setError(null);
    setResult(null);

    try {
      const csv = await selected.text();
      const res = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      });
      const payload = await res.json() as { ok?: boolean; report?: ImportResult; error?: string };
      if (!res.ok || !payload.ok) {
        setError(payload.error ?? 'Error al importar.');
        return;
      }
      setResult(payload.report ?? null);
      router.refresh();
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="csv-importer">
      <p className="csv-importer-label">Importar CSV</p>
      <small>Seleccioná un archivo .csv con columnas: phone, display_name, wa_id, opt_in_source, tags.</small>
      <div className="csv-importer-actions">
        <label className="button-secondary csv-file-button">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            disabled={importing}
          />
          {importing ? 'Importando…' : 'Seleccionar archivo'}
        </label>
        <a href="/api/contacts/template" className="button-link-secondary csv-template-link">Descargar plantilla</a>
      </div>
      {result && (
        <p className="notice">
          {result.created} creados, {result.duplicates} duplicados, {result.rejectedCount} rechazados.
        </p>
      )}
      {error && <p className="notice notice-error">{error}</p>}
    </div>
  );
}
