'use client';

import { useState } from 'react';

import { Modal } from '@/components/Modal';

type StorageBrowserFileEntry = {
  relativePath: string;
  absolutePath: string;
  size: number;
  modifiedAt: string;
};

type StorageBrowserRootListing = {
  kind: 'exports' | 'database';
  label: string;
  rootPath: string;
  available: boolean;
  note?: string;
  files: StorageBrowserFileEntry[];
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function StorageBrowser() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roots, setRoots] = useState<StorageBrowserRootListing[]>([]);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  async function openBrowser() {
    setOpen(true);
    setLoading(true);
    setError(null);
    setCopiedPath(null);

    try {
      const response = await fetch('/api/settings/storage-browser', { cache: 'no-store' });
      const payload = await response.json() as { roots?: StorageBrowserRootListing[]; error?: string };
      if (!response.ok) {
        setError(payload.error || 'No se pudo cargar el listado.');
        setRoots([]);
        return;
      }
      setRoots(payload.roots || []);
    } catch {
      setError('No se pudo cargar el listado.');
      setRoots([]);
    } finally {
      setLoading(false);
    }
  }

  async function copyPath(absolutePath: string) {
    try {
      await navigator.clipboard.writeText(absolutePath);
      setCopiedPath(absolutePath);
      window.setTimeout(() => setCopiedPath((current) => current === absolutePath ? null : current), 2000);
    } catch {
      setCopiedPath(null);
    }
  }

  return (
    <>
      <button type="button" className="compact-action-button" onClick={openBrowser} style={{ background: '#2563eb', borderColor: '#1d4ed8' }}>
        Ver respaldos locales
      </button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <div className="stack" style={{ gap: 12, minWidth: 720, maxWidth: 920 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <h3 style={{ margin: '0 0 4px' }}>Respaldos locales del servidor</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>ZIPs de exportación/restauración y backups SQL accesibles desde la app.</p>
            </div>
            <button type="button" className="button-secondary" onClick={() => setOpen(false)}>Cerrar</button>
          </div>

          {loading ? <p>Cargando archivos…</p> : null}
          {error ? <p className="notice notice-error">{error}</p> : null}

          {!loading && !error ? roots.map((root) => (
            <section key={root.kind} className="card stack" style={{ gap: 8 }}>
              <div>
                <strong>{root.label}</strong>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 4, wordBreak: 'break-all' }}>{root.rootPath}</div>
                {root.note ? <div style={{ fontSize: '0.75rem', color: root.available ? '#6b7280' : '#dc2626', marginTop: 4 }}>{root.note}</div> : null}
              </div>

              {!root.available ? (
                <p className="text-muted">Esta ruta no está disponible desde el contenedor web.</p>
              ) : root.files.length === 0 ? (
                <p className="text-muted">No hay archivos disponibles en esta ruta.</p>
              ) : (
                <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 4 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Archivo</th>
                        <th>Tamaño</th>
                        <th>Actualizado</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {root.files.map((file) => (
                        <tr key={`${root.kind}:${file.relativePath}`}>
                          <td style={{ minWidth: 260 }}>
                            <div style={{ fontWeight: 600 }}>{file.relativePath}</div>
                            <small style={{ color: '#6b7280', wordBreak: 'break-all' }}>{file.absolutePath}</small>
                          </td>
                          <td>{formatSize(file.size)}</td>
                          <td>{new Date(file.modifiedAt).toLocaleString('es-GT', { timeZone: 'America/Guatemala' })}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <a
                                href={`/api/settings/storage-browser/download?kind=${root.kind}&path=${encodeURIComponent(file.relativePath)}`}
                                className="compact-action-button"
                                style={{ textDecoration: 'none' }}
                              >
                                Descargar
                              </a>
                              <button type="button" className="button-secondary" onClick={() => copyPath(file.absolutePath)}>
                                {copiedPath === file.absolutePath ? 'Copiado' : 'Copiar ruta'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )) : null}
        </div>
      </Modal>
    </>
  );
}
