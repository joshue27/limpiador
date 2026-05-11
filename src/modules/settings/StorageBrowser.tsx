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
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [restoreState, setRestoreState] = useState<{
    absolutePath: string;
    phase: 'confirm' | 'starting' | 'running' | 'done' | 'error';
    progress?: number;
    message?: string;
  } | null>(null);

  async function loadRoots() {
    const response = await fetch('/api/settings/storage-browser', { cache: 'no-store' });
    const payload = (await response.json()) as {
      roots?: StorageBrowserRootListing[];
      error?: string;
    };
    if (!response.ok) {
      throw new Error(payload.error || 'No se pudo cargar el listado.');
    }
    return payload.roots || [];
  }

  async function openBrowser() {
    setOpen(true);
    setLoading(true);
    setError(null);
    setCopiedPath(null);

    try {
      setRoots(await loadRoots());
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
      window.setTimeout(
        () => setCopiedPath((current) => (current === absolutePath ? null : current)),
        2000,
      );
    } catch {
      setCopiedPath(null);
    }
  }

  async function deleteFile(kind: StorageBrowserRootListing['kind'], relativePath: string) {
    const key = `${kind}:${relativePath}`;
    setPendingDelete(key);
    setError(null);

    try {
      const response = await fetch('/api/settings/storage-browser/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, path: relativePath }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!response.ok || !payload?.ok) {
        setError(payload?.error || 'No se pudo eliminar el archivo.');
        return;
      }
      setRoots(await loadRoots());
      setConfirmDeleteKey(null);
    } catch {
      setError('No se pudo eliminar el archivo.');
    } finally {
      setPendingDelete(null);
    }
  }

  async function startRestore(absolutePath: string) {
    setRestoreState({ absolutePath, phase: 'starting', message: 'Iniciando restauración…' });

    try {
      const response = await fetch('/api/exports/restore/local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: absolutePath }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        restoreRunId?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        setRestoreState({ absolutePath, phase: 'error', message: payload?.error || 'Error al iniciar' });
        return;
      }

      const runId = payload.restoreRunId!;
      setRestoreState({ absolutePath, phase: 'running', progress: 0, message: 'Restaurando…' });

      // Poll status until done
      const poll = async () => {
        try {
          const res = await fetch(`/api/exports/restore/${runId}`, { cache: 'no-store' });
          const data = await res.json().catch(() => null) as {
            status?: string;
            progress?: number;
            counts?: { conversationsRestored: number; messagesRestored: number; mediaRestored: number } | null;
            error?: string | null;
          } | null;

          if (!data || !data.status) {
            setRestoreState({ absolutePath, phase: 'error', message: 'Error al consultar estado' });
            return;
          }

          if (data.status === 'FAILED') {
            setRestoreState({ absolutePath, phase: 'error', message: data.error || 'Error en la restauración' });
            return;
          }

          if (data.status === 'READY') {
            const counts = data.counts;
            const msg = counts
              ? `Restaurado: ${counts.conversationsRestored} conversaciones, ${counts.messagesRestored} mensajes, ${counts.mediaRestored} archivos`
              : 'Restauración completada';
            setRestoreState({ absolutePath, phase: 'done', progress: 100, message: msg });
            // Reload file list to reflect any changes
            setRoots(await loadRoots());
            return;
          }

          // Still running — poll again
          setRestoreState({ absolutePath, phase: 'running', progress: data.progress ?? 0, message: 'Restaurando…' });
          setTimeout(poll, 2_000);
        } catch {
          setRestoreState({ absolutePath, phase: 'error', message: 'Error de conexión al consultar estado' });
        }
      };

      setTimeout(poll, 2_000);
    } catch {
      setRestoreState({ absolutePath, phase: 'error', message: 'Error de conexión al iniciar' });
    }
  }

  function restoreBanner() {
    if (!restoreState) return null;

    const { phase, progress, message } = restoreState;

    if (phase === 'confirm') {
      return (
        <div className="notice" style={{ background: '#fef3c7', border: '1px solid #f59e0b', padding: '8px 12px', borderRadius: 4, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <small style={{ color: '#92400e' }}>¿Restaurar desde este archivo? Los datos existentes podrían duplicarse.</small>
          <button type="button" className="compact-action-button" onClick={() => void startRestore(restoreState.absolutePath)} style={{ fontSize: '0.7rem', background: '#7c3aed', borderColor: '#6d28d9' }}>Sí, restaurar</button>
          <button type="button" className="button-secondary" onClick={() => setRestoreState(null)} style={{ fontSize: '0.7rem' }}>Cancelar</button>
        </div>
      );
    }

    if (phase === 'starting' || phase === 'running') {
      return (
        <div className="notice" style={{ background: '#eff6ff', border: '1px solid #3b82f6', padding: '8px 12px', borderRadius: 4, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <small style={{ color: '#1e40af' }}>{message}</small>
            {progress != null && <small style={{ color: '#6b7280' }}>({progress}%)</small>}
          </div>
          {progress != null && (
            <div className="campaign-progress-bar" style={{ marginTop: 4, height: 6 }}>
              <div className="campaign-progress-fill" style={{ width: `${progress}%`, background: '#3b82f6' }} />
            </div>
          )}
        </div>
      );
    }

    if (phase === 'done') {
      return (
        <div className="notice" style={{ background: '#f0fdf4', border: '1px solid #22c55e', padding: '8px 12px', borderRadius: 4, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <small style={{ color: '#166534' }}>✅ {message}</small>
          <button type="button" className="button-secondary" onClick={() => setRestoreState(null)} style={{ fontSize: '0.7rem' }}>Cerrar</button>
        </div>
      );
    }

    if (phase === 'error') {
      return (
        <div className="notice notice-error" style={{ padding: '8px 12px', borderRadius: 4, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <small>❌ {message}</small>
          <button type="button" className="button-secondary" onClick={() => setRestoreState(null)} style={{ fontSize: '0.7rem' }}>Cerrar</button>
        </div>
      );
    }

    return null;
  }

  return (
    <>
      <button
        type="button"
        className="compact-action-button"
        onClick={openBrowser}
        style={{ background: '#2563eb', borderColor: '#1d4ed8' }}
      >
        Ver respaldos locales
      </button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <div className="stack" style={{ gap: 12, minWidth: 720, maxWidth: 920 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div>
              <h3 style={{ margin: '0 0 4px' }}>Respaldos locales del servidor</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>
                ZIPs de exportación/restauración y backups SQL accesibles desde la app.
              </p>
            </div>
            <button type="button" className="button-secondary" onClick={() => setOpen(false)}>
              Cerrar
            </button>
          </div>

          {loading ? <p>Cargando archivos…</p> : null}
          {error ? <p className="notice notice-error">{error}</p> : null}

          {!loading && !error
            ? roots.map((root) => (
                <section key={root.kind} className="card stack" style={{ gap: 8 }}>
                  <div>
                    <strong>{root.label}</strong>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: '#6b7280',
                        marginTop: 4,
                        wordBreak: 'break-all',
                      }}
                    >
                      {root.rootPath}
                    </div>
                    {root.note ? (
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: root.available ? '#6b7280' : '#dc2626',
                          marginTop: 4,
                        }}
                      >
                        {root.note}
                      </div>
                    ) : null}
                  </div>

                  {restoreBanner()}
                  {!root.available ? (
                    <p className="text-muted">
                      Esta ruta no está disponible desde el contenedor web.
                    </p>
                  ) : root.files.length === 0 ? (
                    <p className="text-muted">No hay archivos disponibles en esta ruta.</p>
                  ) : (
                    <div
                      style={{
                        maxHeight: 320,
                        overflow: 'auto',
                        border: '1px solid #e5e7eb',
                        borderRadius: 4,
                      }}
                    >
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
                                <small style={{ color: '#6b7280', wordBreak: 'break-all' }}>
                                  {file.absolutePath}
                                </small>
                              </td>
                              <td>{formatSize(file.size)}</td>
                              <td>
                                {new Date(file.modifiedAt).toLocaleString('es-GT', {
                                  timeZone: 'America/Guatemala',
                                })}
                              </td>
                              <td>
                                {(() => {
                                  const deleteKey = `${root.kind}:${file.relativePath}`;
                                  const isConfirmingDelete = confirmDeleteKey === deleteKey;
                                  const isDeleting = pendingDelete === deleteKey;

                                  return (
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                      <a
                                        href={`/api/settings/storage-browser/download?kind=${root.kind}&path=${encodeURIComponent(file.relativePath)}`}
                                        className="compact-action-button"
                                        style={{ textDecoration: 'none' }}
                                      >
                                        Descargar
                                      </a>
                                      <button
                                        type="button"
                                        className="button-secondary"
                                        onClick={() => copyPath(file.absolutePath)}
                                      >
                                        {copiedPath === file.absolutePath
                                          ? 'Copiado'
                                          : 'Copiar ruta'}
                                      </button>
                                      {root.kind === 'exports' && (
                                        <button
                                          type="button"
                                          className="compact-action-button"
                                          disabled={restoreState?.absolutePath === file.absolutePath && (restoreState.phase === 'starting' || restoreState.phase === 'running')}
                                          onClick={() => setRestoreState({ absolutePath: file.absolutePath, phase: 'confirm' })}
                                          style={{ background: '#7c3aed', borderColor: '#6d28d9' }}
                                        >
                                          {restoreState?.absolutePath === file.absolutePath && restoreState.phase === 'running'
                                            ? `${restoreState.progress ?? 0}%`
                                            : restoreState?.absolutePath === file.absolutePath && restoreState.phase === 'starting'
                                            ? '…'
                                            : 'Restaurar'}
                                        </button>
                                      )}
                                      {!isConfirmingDelete ? (
                                        <button
                                          type="button"
                                          className="button-danger"
                                          disabled={isDeleting}
                                          onClick={() => setConfirmDeleteKey(deleteKey)}
                                        >
                                          {isDeleting ? 'Eliminando…' : 'Eliminar'}
                                        </button>
                                      ) : (
                                        <div
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            padding: '4px 6px',
                                            border: '1px solid #fecaca',
                                            borderRadius: 4,
                                            background: '#fff7f7',
                                          }}
                                        >
                                          <small style={{ color: '#991b1b' }}>¿Eliminar?</small>
                                          <button
                                            type="button"
                                            className="button-danger"
                                            disabled={isDeleting}
                                            onClick={() =>
                                              void deleteFile(root.kind, file.relativePath)
                                            }
                                          >
                                            {isDeleting ? 'Eliminando…' : 'Sí'}
                                          </button>
                                          <button
                                            type="button"
                                            className="button-secondary"
                                            disabled={isDeleting}
                                            onClick={() =>
                                              setConfirmDeleteKey((current) =>
                                                current === deleteKey ? null : current,
                                              )
                                            }
                                          >
                                            No
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              ))
            : null}
        </div>
      </Modal>
    </>
  );
}
