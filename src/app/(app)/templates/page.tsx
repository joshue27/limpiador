import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/modules/auth/guards';
import { TemplateBuilder } from '@/modules/templates/TemplateBuilder';
import { TemplateActions } from '@/modules/templates/TemplateActions';

const statusLabels: Record<string, string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  IN_REVIEW: 'En revisión',
};

const PAGE_SIZE = 15;

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams?: Promise<{ copy?: string; page?: string }>;
}) {
  const session = await requirePermission('templates');
  const params = (await searchParams) ?? {};
  const currentPage = Math.max(1, Number(params.page) || 1);

  const totalTemplates = await prisma.messageTemplate.count();
  const totalPages = Math.ceil(totalTemplates / PAGE_SIZE);

  const templates = await prisma.messageTemplate.findMany({
    orderBy: { createdAt: 'desc' },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  // Load template for copying/editing
  let editTemplate:
    | {
        name: string;
        language: string;
        category: string;
        body: string;
        header?: string | null;
        footer?: string | null;
      }
    | undefined;
  if (params.copy) {
    const t = await prisma.messageTemplate.findUnique({ where: { id: params.copy } });
    if (t) {
      editTemplate = {
        name: t.name,
        language: t.language,
        category: t.category,
        body: t.body,
        header: t.header,
        footer: t.footer,
      };
    }
  }

  return (
    <div className="stack">
      <section>
        <p className="eyebrow">Meta WhatsApp</p>
        <h2>Plantillas</h2>
        <p>Creá plantillas de mensaje enriquecidas y envialas a aprobación de Meta.</p>
      </section>
      <section className="card">
          <TemplateBuilder editTemplate={editTemplate} />
        </section>
      <section className="card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <strong>Plantillas ({totalTemplates})</strong>
              <form action="/api/templates/sync" method="post" style={{ display: 'inline' }}>
                <button type="submit" className="button-secondary" style={{ fontSize: '0.8rem' }}>
                  Sincronizar con Meta
                </button>
              </form>
          </div>
          {totalPages > 1 && (
            <div className="csv-pagination">
              {currentPage > 1 && (
                <a
                  href={`/templates?page=${currentPage - 1}${params.copy ? `&copy=${params.copy}` : ''}`}
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
                  href={`/templates?page=${currentPage + 1}${params.copy ? `&copy=${params.copy}` : ''}`}
                  className="button-secondary"
                  style={{ fontSize: '0.8rem' }}
                >
                  Siguiente →
                </a>
              )}
            </div>
          )}
        </div>
        <div className="table-card">
          {templates.length ? (
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Idioma</th>
                  <th>Categoría</th>
                  <th>Cuerpo</th>
                  <th>Estado Meta</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {templates.map(
                  (template: {
                    id: string;
                    name: string;
                    language: string;
                    category: string;
                    body: string;
                    status: string;
                    available: boolean;
                  }) => (
                    <tr key={template.id}>
                      <td>
                        <strong>{template.name}</strong>
                      </td>
                      <td>{template.language}</td>
                      <td>{template.category}</td>
                      <td>
                        <small>
                          {template.body.slice(0, 90)}
                          {template.body.length > 90 ? '…' : ''}
                        </small>
                      </td>
                      <td>
                        <span
                          className={`status-pill status-${template.status.toLowerCase().replaceAll('_', '-')}`}
                        >
                          {statusLabels[template.status] ?? template.status}
                        </span>
                        {template.status === 'REJECTED' ? (
                          <small className="status-muted">
                            <br />
                            Corrija y vuelva a crear
                          </small>
                        ) : null}
                      </td>
                      <td>
                        <TemplateActions
                          templateId={template.id}
                          templateName={template.name}
                          available={template.available}
                        />
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          ) : (
            <p className="empty-state">
              No hay plantillas todavía. Creá una y enviala a Meta para aprobación.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
