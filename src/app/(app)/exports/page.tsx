import { formatDateTime } from '@/lib/date-format';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/modules/auth/guards';
import { ExportsAutoRefresh } from '@/modules/exports/ExportsAutoRefresh';
import { RestoreForm } from '@/modules/exports/RestoreForm';

const exportStatusLabels: Record<string, string> = {
  PENDING: 'Pendiente',
  RUNNING: 'Generando',
  READY: 'Lista',
  FAILED: 'Con error',
};

const PAGE_SIZE = 15;

function buildPageUrl(page: number, from?: string, to?: string): string {
  const sp = new URLSearchParams();
  sp.set('page', String(page));
  if (from) sp.set('from', from);
  if (to) sp.set('to', to);
  return `/exports?${sp.toString()}`;
}

function formatSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes === 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function ExportsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; from?: string; to?: string }>;
}) {
  await requireRole(['ADMIN']);
  const params = (await searchParams) ?? {};
  const currentPage = Math.max(1, Number(params.page) || 1);

  const totalRuns = await prisma.exportRun.count();
  const totalPages = Math.ceil(totalRuns / PAGE_SIZE);

  const runs = await prisma.exportRun.findMany({
    include: { createdBy: { select: { email: true } } },
    orderBy: { createdAt: 'desc' },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return (
    <div className="stack" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ExportsAutoRefresh />
      <section style={{ flexShrink: 0 }}>
        <p className="eyebrow">Archivos ZIP</p>
        <h2>Exportaciones</h2>
        <p>Solicitá la exportación de archivados por rango de fechas y descargá el ZIP cuando esté listo.</p>
      </section>
      <section className="card" style={{ flexShrink: 0 }}>
        <form className="grid-form" action="/api/exports/create" method="post">
          <input type="date" name="from" defaultValue={params.from ?? ''} required aria-label="Desde" />
          <input type="date" name="to" defaultValue={params.to ?? ''} required aria-label="Hasta" />
          <select name="type" defaultValue="media" aria-label="Tipo de exportación">
            <option value="media">Archivados</option>
            <option value="conversations">Conversaciones</option>
            <option value="contacts">Contactos</option>
            <option value="chat">Chat interno</option>
          </select>
          <button type="submit">Solicitar exportación</button>
        </form>
      </section>
      <section className="card" style={{ flexShrink: 0 }}>
        <h3 style={{ margin: '0 0 8px' }}>Restaurar conversaciones</h3>
        <RestoreForm />
      </section>
      <section className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexShrink: 0 }}>
          <h3 style={{ margin: 0 }}>Exportaciones ({totalRuns})</h3>
          {totalPages > 1 && (
            <div className="csv-pagination">
              {currentPage > 1 && <a href={buildPageUrl(currentPage - 1, params.from, params.to)} className="button-secondary" style={{ fontSize: '0.8rem' }}>← Anterior</a>}
              <small>Pág {currentPage} de {totalPages}</small>
              {currentPage < totalPages && <a href={buildPageUrl(currentPage + 1, params.from, params.to)} className="button-secondary" style={{ fontSize: '0.8rem' }}>Siguiente →</a>}
            </div>
          )}
        </div>
        <div className="table-card" style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {runs.length ? <table>
            <thead><tr><th>Rango</th><th>Estado</th><th>Detalle</th><th>Solicitó</th><th>Archivo</th></tr></thead>
            <tbody>
              {runs.map((run) => {
                const counts = run.countsJson as { total?: number; size?: number; error?: string } | null;
                return (
                  <tr key={run.id}>
                    <td>{run.month}</td>
                    <td>
                      <span className={`status-pill status-${run.status.toLowerCase()}`}>
                        {exportStatusLabels[run.status] ?? run.status}
                      </span>
                      {counts?.error && <br />}
                      {counts?.error && <small style={{ color: '#dc2626', fontSize: '0.65rem' }}>{counts.error}</small>}
                      {run.status === 'RUNNING' && <div className="campaign-progress-bar" style={{ marginTop: 4 }}><div className="campaign-progress-fill" style={{ width: '60%', animation: 'pulse 1.5s infinite' }} /></div>}
                    </td>
                    <td>
                      {counts?.total ? <small>{counts.total} archivos</small> : null}
                      {run.completedAt ? <><br /><small style={{ fontSize: '0.6rem', color: '#9ca3af' }}>{formatDateTime(run.completedAt)}</small></> : null}
                    </td>
                    <td>{run.createdBy.email}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {run.zipKey && run.status === 'READY' ? (
                          <a href={`/api/exports/${run.id}/download`} style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'var(--accent, #075e54)', color: '#fff', border: '1px solid var(--accent, #064e3b)', borderRadius: 2, textDecoration: 'none', fontWeight: 650, display: 'inline-block' }}>
                            Descargar {counts?.size ? formatSize(counts.size) : ''}
                          </a>
                        ) : run.status === 'FAILED' ? (
                          <span className="status-muted">Falló</span>
                        ) : (
                          <span className="status-muted">Pendiente</span>
                        )}
                        <form action={`/api/exports/${run.id}/delete`} method="post">
                          <button type="submit" className="button-danger" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>Eliminar</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table> : <p className="empty-state">No hay exportaciones todavía. Solicitá una con el formulario de arriba.</p>}
        </div>
      </section>
    </div>
  );
}
