import Link from 'next/link';

import { formatDateTimeFull } from '@/lib/date-format';
import { prisma } from '@/lib/prisma';
import { AUDIT_ACTION_OPTIONS } from '@/modules/audit/actions';
import { auditWhereFromParams, type AuditFilterParams } from '@/modules/audit/filters';
import { requireRole } from '@/modules/auth/guards';

const PAGE_SIZE = 25;

function formatMetadata(value: unknown) {
  if (!value) return '-';
  const text = JSON.stringify(value);
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

function exportHref(params: AuditFilterParams) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  return `/api/audit/export${query.size ? `?${query.toString()}` : ''}`;
}

function buildPageUrl(params: AuditFilterParams, page: number): string {
  const sp = new URLSearchParams();
  sp.set('page', String(page));
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== 'page') sp.set(key, value);
  }
  return `/audit?${sp.toString()}`;
}

export default async function AuditPage({ searchParams }: { searchParams?: Promise<AuditFilterParams & { page?: string }> }) {
  const session = await requireRole(['ADMIN']);
  const params = (await searchParams) ?? {};
  const currentPage = Math.max(1, Number(params.page) || 1);
  const where = auditWhereFromParams(params);

  const totalLogs = await prisma.auditLog.count({ where });
  const totalPages = Math.ceil(totalLogs / PAGE_SIZE);

  const logs = await prisma.auditLog.findMany({
    where,
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: 'desc' },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return (
    <div className="stack" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <section style={{ flexShrink: 0 }}>
        <p className="eyebrow">Seguridad</p>
        <h2>Auditoría</h2>
        <p>Consultá la actividad de ingresos, campañas, contactos, archivados y exportaciones.</p>
      </section>
      <section className="card" style={{ flexShrink: 0 }}>
        <form className="grid-form" action="/audit" style={{ gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <label>
            Desde
            <input type="date" name="from" defaultValue={params.from ?? ''} />
          </label>
          <label>
            Hasta
            <input type="date" name="to" defaultValue={params.to ?? ''} />
          </label>
          <label>
            Acción
            <select name="action" defaultValue={params.action ?? ''}>
              <option value="">Todas</option>
              {AUDIT_ACTION_OPTIONS.map((action) => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
          </label>
          <label>
            Usuario
            <input name="user" placeholder="usuario@empresa.com" defaultValue={params.user ?? ''} />
          </label>
          <label>
            Entidad
            <input name="entityType" placeholder="contacto, comprobante..." defaultValue={params.entityType ?? ''} />
          </label>
          <label>
            ID
            <input name="entityId" placeholder="ID exacto" defaultValue={params.entityId ?? ''} />
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <button type="submit">Filtrar</button>
            <Link href={exportHref(params)} style={{ fontSize: '0.8rem', padding: '4px 10px', background: 'var(--accent, #075e54)', color: '#fff', border: '1px solid var(--accent, #064e3b)', borderRadius: 2, textDecoration: 'none', fontWeight: 650 }}>Exportar CSV</Link>
          </div>
        </form>
      </section>
      <section className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexShrink: 0 }}>
          <h3 style={{ margin: 0 }}>Eventos ({totalLogs})</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {totalPages > 1 && (
              <div className="csv-pagination">
                {currentPage > 1 && <Link href={buildPageUrl(params, currentPage - 1)} style={{ fontSize: '0.8rem', padding: '3px 10px', background: 'var(--accent, #075e54)', color: '#fff', border: '1px solid var(--accent, #064e3b)', borderRadius: 2, textDecoration: 'none', fontWeight: 650 }}>← Anterior</Link>}
                <small>Pág {currentPage} de {totalPages}</small>
                {currentPage < totalPages && <Link href={buildPageUrl(params, currentPage + 1)} style={{ fontSize: '0.8rem', padding: '3px 10px', background: 'var(--accent, #075e54)', color: '#fff', border: '1px solid var(--accent, #064e3b)', borderRadius: 2, textDecoration: 'none', fontWeight: 650 }}>Siguiente →</Link>}
              </div>
            )}
          </div>
        </div>
        <div className="table-card" style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {logs.length ? <table>
            <thead><tr><th>Fecha</th><th>Acción</th><th>Usuario</th><th>Entidad</th><th>IP</th><th>Detalle</th></tr></thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.75rem' }}>{formatDateTimeFull(log.createdAt)}</td>
                  <td style={{ fontSize: '0.75rem' }}>{log.action}</td>
                  <td style={{ fontSize: '0.75rem' }}>{log.user?.email ?? 'Sistema'}</td>
                  <td style={{ fontSize: '0.75rem' }}>{log.entityType ?? '-'}{log.entityId ? <><br /><small>{log.entityId.slice(0, 20)}</small></> : null}</td>
                  <td style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{log.ipAddress ?? '-'}</td>
                  <td style={{ fontSize: '0.65rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}><code>{formatMetadata(log.metadataJson)}</code></td>
                </tr>
              ))}
            </tbody>
          </table> : <p className="empty-state">No hay eventos para esos filtros.</p>}
        </div>
      </section>
    </div>
  );
}
