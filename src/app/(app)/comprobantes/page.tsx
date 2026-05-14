import { formatDateTime } from '@/lib/date-format';
import { prisma } from '@/lib/prisma';
import { AssetPopover } from '@/modules/comprobantes/AssetPopover';
import { toggleArchivado } from '@/modules/comprobantes/actions';
import { buildComprobantesWhere } from '@/modules/comprobantes/where';
import { requirePermission } from '@/modules/auth/guards';

const downloadStatusLabels: Record<string, string> = {
  PENDING: 'Pendiente',
  DOWNLOADING: 'Descargando',
  READY: 'Disponible',
  FAILED: 'Con error',
};

const PAGE_SIZE = 20;

function buildPageUrl(params: Record<string, string | undefined>, page: number): string {
  const sp = new URLSearchParams();
  sp.set('page', String(page));
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== 'page') sp.set(key, value);
  }
  return `/comprobantes?${sp.toString()}`;
}

export default async function ComprobantesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    from?: string;
    to?: string;
    status?: string;
    comprobante?: string;
    page?: string;
  }>;
}) {
  const session = await requirePermission('comprobantes');
  const params = await searchParams;
  const currentPage = Math.max(1, Number(params?.page) || 1);
  const status = ['PENDING', 'DOWNLOADING', 'READY', 'FAILED'].includes(params?.status ?? '')
    ? params?.status
    : '';
  const comprobante =
    params?.comprobante === 'yes' ? true : params?.comprobante === 'no' ? false : undefined;
  const fromDate = params?.from ? new Date(`${params.from}T00:00:00.000Z`) : undefined;
  const toDate = params?.to ? new Date(`${params.to}T23:59:59.999Z`) : undefined;

  const validFrom = fromDate && !isNaN(fromDate.getTime()) ? fromDate : undefined;
  const validTo = toDate && !isNaN(toDate.getTime()) ? toDate : undefined;

  const where = buildComprobantesWhere(session, {
    status,
    comprobante,
    from: validFrom,
    to: validTo,
  });

  const totalMedia = await prisma.mediaAsset.count({ where });
  const totalPages = Math.ceil(totalMedia / PAGE_SIZE);

  const media = await prisma.mediaAsset.findMany({
    where,
    include: { message: { include: { contact: true } }, markedBy: { select: { email: true } } },
    orderBy: { createdAt: 'desc' },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const urlParams: Record<string, string | undefined> = {
    from: params?.from,
    to: params?.to,
    status,
    comprobante: params?.comprobante,
  };

  return (
    <div className="stack" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <section style={{ flexShrink: 0 }}>
        <p className="eyebrow">Adjuntos privados</p>
        <h2>Archivados</h2>
        <p>Revisá adjuntos recibidos y archivá los importantes.</p>
      </section>
      <section className="card" style={{ flexShrink: 0 }}>
        <form className="grid-form" action="/comprobantes">
          <input type="date" name="from" defaultValue={params?.from ?? ''} aria-label="Desde" />
          <input type="date" name="to" defaultValue={params?.to ?? ''} aria-label="Hasta" />
          <select name="status" defaultValue={status} aria-label="Estado de descarga">
            <option value="">Todos los estados</option>
            <option value="PENDING">Pendiente</option>
            <option value="DOWNLOADING">Descargando</option>
            <option value="READY">Disponible</option>
            <option value="FAILED">Con error</option>
          </select>
          <select
            name="comprobante"
            defaultValue={params?.comprobante ?? ''}
            aria-label="Filtro archivado"
          >
            <option value="">Todos</option>
            <option value="yes">Solo archivados</option>
            <option value="no">Sin archivar</option>
          </select>
          <button type="submit">Filtrar</button>
        </form>
      </section>
      <section
        className="card"
        style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
            flexShrink: 0,
          }}
        >
          <h3 style={{ margin: 0 }}>Archivos ({totalMedia})</h3>
          {totalPages > 1 && (
            <div className="csv-pagination">
              {currentPage > 1 && (
                <a
                  href={buildPageUrl(urlParams, currentPage - 1)}
                  className="button-secondary"
                  style={{ fontSize: '0.8rem' }}
                >
                  ← Anterior
                </a>
              )}
              <small>
                Pág {currentPage} de {totalPages}
              </small>
              {currentPage < totalPages && (
                <a
                  href={buildPageUrl(urlParams, currentPage + 1)}
                  className="button-secondary"
                  style={{ fontSize: '0.8rem' }}
                >
                  Siguiente →
                </a>
              )}
            </div>
          )}
        </div>
        <div className="table-card" style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {media.length ? (
            <table>
              <thead>
                <tr>
                  <th>Contacto</th>
                  <th>Archivo</th>
                  <th>Estado</th>
                  <th>Archivado</th>
                  <th>Descarga</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {media.map((asset) => (
                  <tr key={asset.id} id={asset.id}>
                    <td>{asset.message.contact.displayName ?? asset.message.contact.phone}</td>
                    <td>
                      {asset.filename ?? asset.waMediaId}
                      <br />
                      <small>
                        {asset.mimeType} · {asset.size ?? '-'} bytes
                      </small>
                    </td>
                    <td>
                      {downloadStatusLabels[asset.downloadStatus] ?? asset.downloadStatus}
                      {asset.downloadError ? `: ${asset.downloadError}` : ''}
                      <br />
                      <small style={{ fontSize: '0.6rem', color: '#9ca3af' }}>
                        {formatDateTime(asset.createdAt)}
                      </small>
                    </td>
                    <td>
                      <form action={toggleArchivado} className="mini-form">
                        <input type="hidden" name="id" value={asset.id} />
                        <input
                          type="hidden"
                          name="isComprobante"
                          value={String(!asset.isComprobante)}
                        />
                        {asset.isComprobante ? (
                          <input
                            name="confirmation"
                            placeholder="Escriba DESMARCAR"
                            aria-label="Confirmación para desmarcar"
                          />
                        ) : null}
                        <button type="submit">
                          {asset.isComprobante ? 'Desarchivar' : 'Archivar'}
                        </button>
                      </form>
                      {asset.markedBy ? (
                        <small>
                          Marcado por {asset.markedBy.email}
                          {asset.markedAt ? ` · ${formatDateTime(asset.markedAt)}` : ''}
                        </small>
                      ) : (
                        <small>No marcado</small>
                      )}
                    </td>
                    <td>
                      {asset.storageKey && asset.downloadStatus === 'READY' ? (
                        <a
                          href={`/api/media/${asset.id}/download`}
                          style={{
                            fontSize: '0.7rem',
                            padding: '2px 8px',
                            background: 'var(--accent, #075e54)',
                            color: '#fff',
                            border: '1px solid var(--accent, #064e3b)',
                            borderRadius: 2,
                            textDecoration: 'none',
                            fontWeight: 650,
                          }}
                        >
                          Descargar
                        </a>
                      ) : (
                        <span className="status-muted">No disponible</span>
                      )}
                    </td>
                    <td>
                      <AssetPopover
                        asset={{
                          id: asset.id,
                          filename: asset.filename,
                          mimeType: asset.mimeType,
                          size: asset.size,
                          downloadStatus: asset.downloadStatus,
                          downloadError: asset.downloadError,
                          createdAt: asset.createdAt.toISOString(),
                          storageKey: asset.storageKey,
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty-state">
              No hay adjuntos para estos filtros. Cuando lleguen imágenes, audios o documentos por
              WhatsApp, aparecerán aquí.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
