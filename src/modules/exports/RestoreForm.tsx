'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type RestoreRunStatus = 'PENDING' | 'RUNNING' | 'READY' | 'FAILED';

type RestoreCounts = {
  conversationsRestored: number;
  messagesRestored: number;
  mediaRestored: number;
};

export type RestoreRunStatusPayload = {
  id: string;
  status: RestoreRunStatus;
  progress: number;
  counts: RestoreCounts | null;
  error: string | null;
  updatedAt: string;
};

type RestoreStartResponse = {
  ok?: boolean;
  error?: string;
  restoreRunId?: string;
  status?: RestoreRunStatus;
};

type RestoreUploadInitResponse = {
  ok?: boolean;
  error?: string;
  uploadId?: string;
};

const RESTORE_UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;

export function isRestoreTerminalStatus(status: RestoreRunStatus) {
  return status === 'READY' || status === 'FAILED';
}

export function formatRestoreStatusMessage(status: RestoreRunStatusPayload) {
  if (status.status === 'FAILED') {
    return status.error || 'Error al restaurar';
  }

  if (status.status === 'READY') {
    const counts = status.counts ?? {
      conversationsRestored: 0,
      messagesRestored: 0,
      mediaRestored: 0,
    };
    return `${counts.conversationsRestored} conversaciones, ${counts.messagesRestored} mensajes y ${counts.mediaRestored} archivos restaurados.`;
  }

  if (status.status === 'RUNNING') {
    return `Restauración en progreso (${status.progress}%).`;
  }

  return `Restauración en cola (${status.progress}%).`;
}

function createPendingRestoreStatus(
  restoreRunId: string,
  status: RestoreRunStatus = 'PENDING',
): RestoreRunStatusPayload {
  return {
    id: restoreRunId,
    status,
    progress: status === 'RUNNING' ? 10 : status === 'READY' || status === 'FAILED' ? 100 : 0,
    counts: null,
    error: null,
    updatedAt: new Date().toISOString(),
  };
}

export function RestoreForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoreRunId, setRestoreRunId] = useState<string | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<RestoreRunStatusPayload | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreCompleted = restoreStatus?.status === 'READY';

  useEffect(() => {
    if (!restoreRunId || (restoreStatus && isRestoreTerminalStatus(restoreStatus.status))) {
      return undefined;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const pollStatus = async () => {
      try {
        const response = await fetch(`/api/exports/restore/${restoreRunId}`, { cache: 'no-store' });
        const data = (await response.json().catch(() => null)) as
          | RestoreRunStatusPayload
          | { error?: string }
          | null;

        if (cancelled) return;

        if (!response.ok || !data || !('status' in data)) {
          setError(
            (data && 'error' in data && data.error) ||
              'No pudimos consultar el estado de la restauración.',
          );
          setLoading(false);
          setRestoreRunId(null);
          return;
        }

        setRestoreStatus(data);
        if (data.status === 'FAILED') {
          setError(formatRestoreStatusMessage(data));
          setLoading(false);
          setRestoreRunId(null);
          return;
        }

        if (data.status === 'READY') {
          setResult(formatRestoreStatusMessage(data));
          setLoading(false);
          setRestoreRunId(null);
          setFile(null);
          if (inputRef.current) inputRef.current.value = '';
          router.refresh();
          return;
        }

        setResult(formatRestoreStatusMessage(data));
        timeoutId = setTimeout(pollStatus, 1_000);
      } catch {
        if (cancelled) return;
        setError('No pudimos consultar el estado de la restauración.');
        setLoading(false);
        setRestoreRunId(null);
      }
    };

    timeoutId = setTimeout(pollStatus, 1_000);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [restoreRunId, restoreStatus, router]);

  async function handleRestore() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    let backgroundRestoreQueued = false;
    try {
      const chunkCount = Math.max(1, Math.ceil(file.size / RESTORE_UPLOAD_CHUNK_BYTES));
      const initRes = await fetch('/api/exports/restore/upload/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          chunkCount,
        }),
      });

      const initPayload = (await initRes
        .json()
        .catch(() => null)) as RestoreUploadInitResponse | null;
      if (!initRes.ok || !initPayload?.ok || !initPayload.uploadId) {
        setError(initPayload?.error || `No se pudo iniciar la subida (${initRes.status}).`);
        setRestoreRunId(null);
        setRestoreStatus(null);
        return;
      }

      for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
        const start = chunkIndex * RESTORE_UPLOAD_CHUNK_BYTES;
        const end = Math.min(file.size, start + RESTORE_UPLOAD_CHUNK_BYTES);
        const chunk = file.slice(start, end);
        const uploadRes = await fetch(`/api/exports/restore/upload/${initPayload.uploadId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Chunk-Index': String(chunkIndex),
          },
          body: chunk,
        });

        if (!uploadRes.ok) {
          const uploadPayload = (await uploadRes.json().catch(() => null)) as {
            error?: string;
          } | null;
          setError(uploadPayload?.error || `Falló la subida del chunk ${chunkIndex + 1}.`);
          setRestoreRunId(null);
          setRestoreStatus(null);
          return;
        }

        const percent = Math.min(99, Math.round(((chunkIndex + 1) / chunkCount) * 100));
        setResult(`Subiendo ZIP… ${percent}%`);
      }

      const res = await fetch('/api/exports/restore/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId: initPayload.uploadId }),
      });

      const data = (await res.json().catch(() => null)) as RestoreStartResponse | null;
      if (!res.ok || !data) {
        setError(data?.error || `No se pudo completar la restauración (${res.status}).`);
        setRestoreRunId(null);
        setRestoreStatus(null);
        return;
      }

      if (!data.ok) {
        setError(data.error || 'Error al restaurar');
        setRestoreRunId(null);
        setRestoreStatus(null);
      } else if (res.status === 202 && data.restoreRunId) {
        const nextStatus = createPendingRestoreStatus(data.restoreRunId, data.status);
        backgroundRestoreQueued = true;
        setRestoreRunId(data.restoreRunId);
        setRestoreStatus(nextStatus);
        setResult(formatRestoreStatusMessage(nextStatus));
      } else {
        setError('Respuesta de restauración inválida');
        setRestoreRunId(null);
        setRestoreStatus(null);
      }
    } catch (err) {
      if (err instanceof TypeError && err.message === 'Failed to fetch') {
        setError('Error de conexión. Verifique que el servidor esté accesible.');
      } else {
        setError('Error al procesar la respuesta del servidor.');
      }
      setRestoreRunId(null);
      setRestoreStatus(null);
    } finally {
      if (!backgroundRestoreQueued) {
        setLoading(false);
      }
    }
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <p className="text-muted">
        Suba un ZIP de conversaciones exportado previamente para restaurarlas.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".zip"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        style={{ display: 'none' }}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          className="button-secondary"
          onClick={() => inputRef.current?.click()}
          style={{ fontSize: '0.8rem' }}
        >
          {file ? file.name : 'Seleccionar archivo ZIP'}
        </button>
        {file && (
          <button
            type="button"
            className="compact-action-button"
            onClick={handleRestore}
            disabled={loading}
            style={{ fontSize: '0.8rem' }}
          >
            {loading ? 'Restaurando…' : 'Restaurar'}
          </button>
        )}
      </div>
      {file && <small>{(file.size / 1024).toFixed(0)} KB</small>}
      {result && (
        <p className="notice" style={restoreCompleted ? { color: '#166534' } : undefined}>
          {restoreCompleted ? '✅ ' : ''}
          {result}
        </p>
      )}
      {error && <p className="notice notice-error">{error}</p>}
    </div>
  );
}
