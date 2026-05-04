import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/modules/auth/guards';
import { CampaignForm } from '@/modules/campaigns/CampaignForm';
import { CampaignRow } from '@/modules/campaigns/CampaignRow';
import { buildCampaignCsvHeaderMap, buildCampaignRecipientSummaryMap } from '@/modules/campaigns/list-metrics';

const campaignStatusLabels: Record<string, string> = {
  DRAFT: 'Borrador',
  QUEUED: 'En cola',
  SENDING: 'En envío',
  COMPLETED: 'Finalizada',
  FAILED: 'Con error',
  CANCELLED: 'Cancelada',
};

const PAGE_SIZE = 10;

function extractPlaceholders(body: string): string[] {
  const tokens = new Set<string>();
  const re = /\{\{(\d+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) tokens.add(match[1]);
  return [...tokens].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  const session = await requirePermission('campaigns');
  const params = (await searchParams) ?? {};
  const currentPage = Math.max(1, Number(params.page) || 1);

  const approvedTemplates = await prisma.messageTemplate.findMany({
    where: { status: 'APPROVED' },
    select: { name: true, language: true, body: true },
    orderBy: { name: 'asc' },
  });
  const templateBodyByName = new Map(approvedTemplates.map((template) => [template.name, template.body]));

  const totalCampaigns = await prisma.campaign.count();
  const totalPages = Math.ceil(totalCampaigns / PAGE_SIZE);

  const campaigns = await prisma.campaign.findMany({
    select: {
      id: true,
      name: true,
      templateName: true,
      templateLanguage: true,
      status: true,
      bodyPlaceholderMap: true,
      createdBy: { select: { email: true } },
    },
    orderBy: { createdAt: 'desc' },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const campaignIds = campaigns.map((campaign) => campaign.id);
  const [recipientCountRows, csvHeaderRows] = campaignIds.length > 0
    ? await Promise.all([
        prisma.campaignRecipient.groupBy({
          by: ['campaignId', 'status'],
          where: { campaignId: { in: campaignIds } },
          _count: { _all: true },
        }),
        prisma.$queryRaw<Array<{ campaignId: string; header: string }>>(Prisma.sql`
          SELECT
            cr.campaign_id AS "campaignId",
            csv_keys.header AS "header"
          FROM campaign_recipients cr
          CROSS JOIN LATERAL jsonb_object_keys(COALESCE(cr.csv_data, '{}'::jsonb)) AS csv_keys(header)
          WHERE cr.campaign_id IN (${Prisma.join(campaignIds)})
          GROUP BY cr.campaign_id, csv_keys.header
          ORDER BY cr.campaign_id ASC, csv_keys.header ASC
        `),
      ])
    : [[], []];
  const recipientSummaries = buildCampaignRecipientSummaryMap(
    recipientCountRows.map((row) => ({
      campaignId: row.campaignId,
      status: row.status,
      count: row._count._all,
    })),
  );
  const csvHeadersByCampaign = buildCampaignCsvHeaderMap(csvHeaderRows);

  return (
    <div className="stack" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <section style={{ flexShrink: 0 }}>
        <p className="eyebrow">Plantillas aprobadas</p>
        <h2>Campañas</h2>
        <p>Creá borradores, agregá contactos con CSV y lanzá envíos controlados.</p>
      </section>

      {session.role === 'ADMIN' && (
        <section className="card stack" style={{ flexShrink: 0 }}>
          <h3>Nueva campaña</h3>
          <CampaignForm templates={approvedTemplates} />
        </section>
      )}

      <section className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexShrink: 0 }}>
          <h3 style={{ margin: 0 }}>Campañas ({totalCampaigns})</h3>
          {totalPages > 1 && (
            <div className="csv-pagination">
              {currentPage > 1 && <a href={`/campaigns?page=${currentPage - 1}`} className="button-secondary" style={{ fontSize: '0.8rem' }}>← Anterior</a>}
              <small>Pág {currentPage} de {totalPages}</small>
              {currentPage < totalPages && <a href={`/campaigns?page=${currentPage + 1}`} className="button-secondary" style={{ fontSize: '0.8rem' }}>Siguiente →</a>}
            </div>
          )}
        </div>
        <div className="table-card" style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {campaigns.length ? <table>
            <thead><tr><th>Campaña</th><th>Plantilla</th><th>Estado</th><th>Destinatarios</th><th>Creada por</th><th>Acciones</th></tr></thead>
            <tbody>
              {campaigns.map((campaign) => {
                const summary = recipientSummaries.get(campaign.id) ?? { total: 0, counts: {} };
                const counts = summary.counts;
                const total = summary.total;
                const done = (counts.SENT ?? 0) + (counts.DELIVERED ?? 0) + (counts.READ ?? 0);
                const templateBody = templateBodyByName.get(campaign.templateName) ?? '';
                const placeholders = extractPlaceholders(templateBody);
                const csvHeaders = csvHeadersByCampaign.get(campaign.id) ?? [];

                return (
                  <tr key={campaign.id}>
                    <td><strong>{campaign.name}</strong></td>
                    <td>{campaign.templateName} ({campaign.templateLanguage})</td>
                    <td>
                      <span className={`status-pill status-${campaign.status.toLowerCase()}`}>
                        {campaignStatusLabels[campaign.status] ?? campaign.status}
                      </span>
                    </td>
                    <td>
                      {campaign.status === 'SENDING' ? (
                        <><small>{done}/{total}</small><div className="campaign-progress-bar"><div className="campaign-progress-fill" style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} /></div></>
                      ) : (
                        <small>Total: {total} · Enviados: {counts.SENT ?? 0} · Fallidos: {counts.FAILED ?? 0}</small>
                      )}
                    </td>
                    <td>{campaign.createdBy.email}</td>
                    <td>
                      <CampaignRow
                        campaignId={campaign.id}
                        campaignName={campaign.name}
                        status={campaign.status}
                        totalRecipients={total}
                        sent={counts.SENT ?? 0}
                        failed={counts.FAILED ?? 0}
                        placeholders={placeholders}
                        placeholderMap={(campaign.bodyPlaceholderMap as Record<string, string> | null) ?? {}}
                        csvHeaders={csvHeaders}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table> : <p className="empty-state">No hay campañas todavía.</p>}
        </div>
      </section>
    </div>
  );
}
