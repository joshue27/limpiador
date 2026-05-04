import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/modules/auth/guards';
import { MessageChart, DepartmentChart } from '@/modules/dashboard/MessageChart';
import { WhatsAppHealthCard } from '@/modules/dashboard/WhatsAppHealthCard';
import { createWhatsAppCloudClient } from '@/modules/whatsapp/client';

export default async function DashboardPage() {
  const session = await requirePermission('dashboard');
  const isAdmin = session.role === 'ADMIN';

  const [contacts, conversations, unread, archivados, campaigns, templates] = isAdmin
    ? await Promise.all([
        prisma.contact.count(),
        prisma.conversation.count(),
        prisma.conversation.aggregate({ _sum: { unreadCount: true } }),
        prisma.mediaAsset.count({ where: { isComprobante: true } }),
        prisma.campaign.count(),
        prisma.messageTemplate.count({ where: { status: 'APPROVED' } }),
      ])
    : await Promise.all([
        prisma.contact.count({ where: { assignedOperatorId: session.userId } }),
        prisma.conversation.count({ where: { OR: [{ assignedToId: session.userId }, { assignedDepartment: { users: { some: { userId: session.userId } } } }] } }),
        prisma.conversation.aggregate({ _sum: { unreadCount: true }, where: { assignedToId: session.userId } }),
        0, 0, 0,
      ]);

  // Message activity for last 7 days
  const today = new Date();
  const labels: string[] = [];
  const outbound: number[] = [];
  const inbound: number[] = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(dayStart.getTime() + 86400000);

    labels.push(date.toLocaleDateString('es', { weekday: 'short', day: 'numeric' }));

    const [sent, received] = await Promise.all([
      prisma.message.count({
        where: {
          direction: 'OUTBOUND',
          createdAt: { gte: dayStart, lt: dayEnd },
          ...(!isAdmin ? { conversation: { assignedToId: session.userId } } : {}),
        },
      }),
      prisma.message.count({
        where: {
          direction: 'INBOUND',
          createdAt: { gte: dayStart, lt: dayEnd },
          ...(!isAdmin ? { conversation: { assignedToId: session.userId } } : {}),
        },
      }),
    ]);
    outbound.push(sent);
    inbound.push(received);
  }

  // Department activity for admin — last 30 days
  let deptLabels: string[] = [];
  let deptCounts: number[] = [];
  if (isAdmin) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const departments = await prisma.department.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    });
    deptLabels = departments.map(d => d.name);
    deptCounts = await Promise.all(
      departments.map(d => prisma.message.count({
        where: { direction: 'OUTBOUND', conversation: { assignedDepartmentId: d.id }, createdAt: { gte: thirtyDaysAgo } },
      })),
    );
  }

  // WhatsApp phone health for admin
  let phoneHealth: { displayNumber: string; quality: string; limit: string } | null = null;
  if (isAdmin) {
    const config = (await import('@/lib/config')).getConfig();
    try {
      const client = createWhatsAppCloudClient();
      const info = await client.getPhoneNumberInfo();
      phoneHealth = {
        displayNumber: info.display_phone_number || config.whatsapp.phoneNumberId,
        quality: info.quality_rating || 'UNKNOWN',
        limit: String(info.messaging_limit ?? '?'),
      };
    } catch {
      // Fallback: show basic info from config
      phoneHealth = {
        displayNumber: config.whatsapp.phoneNumberId,
        quality: 'UNKNOWN',
        limit: '?',
      };
    }
  }

  return (
    <div className="stack" style={{ height: '100%' }}>
      <section>
        <p className="eyebrow">Bienvenido</p>
        <h2>{session.name || session.email}</h2>
        <p>{isAdmin ? 'Resumen general del sistema.' : 'Tus métricas de atención.'}</p>
      </section>
      <section className="metric-grid">
        <MetricCard label="Contactos" value={contacts} icon="👥" color="#3b82f6" href="/contacts" />
        <MetricCard label="Conversaciones" value={conversations} icon="💬" color="#10b981" href="/inbox" />
        <MetricCard label="No leídos" value={unread._sum.unreadCount ?? 0} icon="🔴" color="#ef4444" href="/inbox" />
        {isAdmin && (
          <>
            <MetricCard label="Archivados" value={archivados} icon="📎" color="#f59e0b" href="/comprobantes" />
            <MetricCard label="Campañas" value={campaigns} icon="📢" color="#8b5cf6" href="/campaigns" />
            <MetricCard label="Plantillas OK" value={templates} icon="✅" color="#06b6d4" href="/templates" />
          </>
        )}
      </section>
      {phoneHealth && (
        <WhatsAppHealthCard
          phoneNumberId=""
          qualityRating={phoneHealth.quality}
          messagingLimit={phoneHealth.limit}
          displayPhoneNumber={phoneHealth.displayNumber}
        />
      )}
      <section className="card">
        <h3 style={{ margin: '0 0 8px' }}>Mensajes por día</h3>
        <MessageChart data={{ labels, outbound, inbound }} />
      </section>
      {isAdmin && deptLabels.length > 0 && (
        <section className="card">
          <h3 style={{ margin: '0 0 8px' }}>Enviados por departamento (30 días)</h3>
          <DepartmentChart labels={deptLabels} counts={deptCounts} />
        </section>
      )}
    </div>
  );
}

function MetricCard({ label, value, icon, color, href }: { label: string; value: number; icon: string; color: string; href: string }) {
  return (
    <a href={href} className="card metric-card" style={{ textDecoration: 'none', borderTop: `3px solid ${color}` }}>
      <span style={{ fontSize: '1.5rem' }}>{icon}</span>
      <div>
        <strong style={{ fontSize: '1.5rem', color }}>{value.toLocaleString()}</strong>
        <small style={{ display: 'block', color: '#6b7280', fontSize: '0.8rem' }}>{label}</small>
      </div>
    </a>
  );
}
