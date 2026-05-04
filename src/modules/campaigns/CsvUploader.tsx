'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type CsvRow = Record<string, string>;

export function CsvUploader({ campaignId, compact }: { campaignId?: string; compact?: boolean }) {
  const router = useRouter();
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<CsvRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; existing: number; errors: number } | null>(null);
  const [page, setPage] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const pageSize = 10;

  function parsePreview(text: string): CsvRow[] {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    const header = lines[0].split(',').map(h => h.trim());
    return lines.slice(1, 200).map(line => {
      const cells = line.split(',').map(c => c.trim());
      const row: CsvRow = {};
      header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
      return row;
    });
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.name.endsWith('.csv')) return;
    setCsvFile(file);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parsePreview(reader.result as string);
      setPreview(rows);
      if (rows.length === 0) setError('El CSV está vacío o no tiene el formato esperado.');
    };
    reader.readAsText(file);
  }, []);

  function removeFile() {
    setCsvFile(null);
    setPreview([]);
    setError(null);
    setResult(null);
    setPage(0);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function importCsv() {
    if (!csvFile) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('csv', csvFile);
      if (campaignId) fd.append('campaignId', campaignId);
      const res = await fetch('/api/campaigns/import-csv', { method: 'POST', body: fd });
      const data = await res.json() as { ok?: boolean; error?: string; created?: number; existing?: number; errors?: number };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Error al importar');
      } else {
        setResult({ created: data.created ?? 0, existing: data.existing ?? 0, errors: data.errors ?? 0 });
        router.refresh();
      }
    } catch {
      setError('Error de conexión al importar.');
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.ceil(preview.length / pageSize);
  const pageRows = preview.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="csv-uploader">
      <div
        className={`csv-drop-zone ${dragOver ? 'csv-drop-zone-over' : ''} ${csvFile ? 'csv-drop-zone-loaded' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !csvFile && fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setCsvFile(f);
              const reader = new FileReader();
              reader.onload = () => setPreview(parsePreview(reader.result as string));
              reader.readAsText(f);
            }
          }}
          style={{ display: 'none' }}
        />
        {csvFile ? (
          <div className="csv-file-info">
            <strong>{csvFile.name}</strong>
            <small>{preview.length} contactos · {(csvFile.size / 1024).toFixed(0)} KB</small>
            <button type="button" className="csv-remove-btn" onClick={(e) => { e.stopPropagation(); removeFile(); }}>× Quitar</button>
          </div>
        ) : (
          <div className="csv-drop-placeholder">
            <span>📄</span>
            <p>Arrastre un archivo CSV o haga clic para buscar</p>
            <small>Columnas: phone, display_name, wa_id (opcional)</small>
          </div>
        )}
      </div>
      <small className="csv-hint">
        <a href="/plantilla_contactos.csv" download style={{ color: '#4338ca' }}>Descargar plantilla de ejemplo</a>
      </small>

      {error && <p className="notice notice-error" style={{ marginTop: 8 }}>{error}</p>}

      {preview.length > 0 && (
        <div className="csv-preview">
          <div className="csv-preview-header">
            <strong>Vista previa ({preview.length} contactos)</strong>
            {totalPages > 1 && (
              <div className="csv-pagination">
                <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)}>←</button>
                <small>{page + 1} / {totalPages}</small>
                <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>→</button>
              </div>
            )}
          </div>
          <div className="table-card" style={{ maxHeight: 280, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  {Object.keys(preview[0]).slice(0, 5).map(k => <th key={k}>{k}</th>)}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, i) => (
                  <tr key={i}>
                    {Object.values(row).slice(0, 5).map((v, j) => <td key={j}>{v}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="compact-action-button" onClick={importCsv} disabled={loading}>
              {loading ? 'Importando…' : `Importar ${preview.length} contactos`}
            </button>
            {result && (
              <small style={{ color: '#166534' }}>
                ✅ {result.created} nuevos, {result.existing} existentes
                {result.errors > 0 && `, ${result.errors} con error`}
              </small>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
