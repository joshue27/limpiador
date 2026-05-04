import { revalidatePath } from 'next/cache';
import Link from 'next/link';

import { prisma } from '@/lib/prisma';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import { requirePermission } from '@/modules/auth/guards';
import { listControlledTags, validActiveControlledTagCodes } from '@/modules/tags/controlled-tags';
import { TagPillSelector } from '@/modules/tags/TagPillSelector';
import { EditableContactRow } from '@/modules/contacts/EditableContactRow';
import { CsvImporter } from '@/modules/contacts/CsvImporter';
import { ContactSearch } from '@/modules/contacts/ContactSearch';

const phonePattern = /^\+?[1-9][0-9]{7,14}$/;

function cleanPhone(value: string) {
  return value.replace(/[\s().-]/g, '').trim();
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

type ImportRow = {
  phone: string;
  waId: string;
  displayName: string | null;
  optInSource: string | null;
  tags: string[];
};

function formatLatestImport(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') return 'Última importación registrada.';
  const report = metadata as Record<string, unknown>;
  const created = typeof report.created === 'number' ? report.created : 0;
  const duplicates = typeof report.duplicates === 'number' ? report.duplicates : 0;
  const rejectedCount = typeof report.rejectedCount === 'number' ? report.rejectedCount : 0;
  return `Última importación: ${created} creados, ${duplicates} duplicados y ${rejectedCount} rechazados.`;
}

function parseContactsCsv(csv: string, activeTagCodes: Set<string>) {
  const rows = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const first = rows[0] ? parseCsvLine(rows[0]).map((cell) => cell.toLowerCase()) : [];
  const hasHeader = first.includes('phone') || first.includes('telefono') || first.includes('wa_id');
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const header = hasHeader ? first : ['phone', 'display_name', 'wa_id', 'opt_in_source', 'tags'];

  const index = (names: string[]) => names.map((name) => header.indexOf(name)).find((position) => position >= 0) ?? -1;
  const phoneIndex = index(['phone', 'telefono', 'teléfono']);
  const nameIndex = index(['display_name', 'name', 'nombre']);
  const waIdIndex = index(['wa_id', 'waid']);
  const sourceIndex = index(['opt_in_source', 'source', 'origen']);
  const tagsIndex = index(['tags', 'tag']);

  const valid: ImportRow[] = [];
  const rejected: Array<{ row: number; reason: string }> = [];
  const seen = new Set<string>();

  dataRows.slice(0, 1000).forEach((line, rowOffset) => {
    const cells = parseCsvLine(line);
    const phone = cleanPhone(cells[phoneIndex] ?? cells[0] ?? '');
    const waId = cleanPhone(cells[waIdIndex] ?? phone);
    const rowNumber = rowOffset + (hasHeader ? 2 : 1);

    if (!phonePattern.test(phone) || !phonePattern.test(waId)) {
      rejected.push({ row: rowNumber, reason: 'Teléfono/wa_id inválido' });
      return;
    }

    if (seen.has(phone) || seen.has(waId)) {
      rejected.push({ row: rowNumber, reason: 'Duplicado dentro del CSV' });
      return;
    }

    seen.add(phone);
    seen.add(waId);
    valid.push({
      phone,
      waId,
      displayName: (cells[nameIndex] ?? '').trim() || null,
      optInSource: (cells[sourceIndex] ?? '').trim() || 'csv-import',
      tags: (cells[tagsIndex] ?? '')
        .split(/[;,]/)
        .map((tag) => tag.trim())
        .filter((tag) => activeTagCodes.has(tag))
        .slice(0, 12),
    });
  });

  return { valid, rejected, truncated: dataRows.length > 1000 };
}

async function createContact(formData: FormData) {
  'use server';
  const session = await requirePermission('contacts');
  const phone = cleanPhone(String(formData.get('phone') ?? ''));
  const waId = cleanPhone(String(formData.get('waId') || phone));
  const displayName = String(formData.get('displayName') ?? '').trim() || null;
  const optInSource = String(formData.get('optInSource') ?? '').trim() || null;
  const tags = await validActiveControlledTagCodes(formData.getAll('tags'));

  if (!phonePattern.test(phone) || !phonePattern.test(waId)) {
    await writeAuditLog({ userId: session.userId, action: AUDIT_ACTIONS.CONTACT_CREATE_REJECTED, metadata: { reason: 'invalid_phone' } });
    return;
  }

  const duplicate = await prisma.contact.findFirst({ where: { OR: [{ phone }, { waId }] }, select: { id: true } });
  if (duplicate) {
    await writeAuditLog({ userId: session.userId, action: AUDIT_ACTIONS.CONTACT_CREATE_REJECTED, entityType: 'contact', entityId: duplicate.id, metadata: { reason: 'duplicate' } });
    return;
  }

  const contact = await prisma.contact.create({ data: { phone, waId, displayName, optInSource, tags } });
  await writeAuditLog({ userId: session.userId, action: AUDIT_ACTIONS.CONTACT_CREATED, entityType: 'contact', entityId: contact.id });
  revalidatePath('/contacts');
}

async function importContactsCsv(formData: FormData) {
  'use server';
  const session = await requirePermission('contacts');
  const csv = String(formData.get('csv') ?? '').trim();
  if (!csv) return;

  const activeTagCodes = new Set((await listControlledTags()).map((tag) => tag.code));
  const parsed = parseContactsCsv(csv, activeTagCodes);
  const existing = parsed.valid.length
    ? await prisma.contact.findMany({
        where: { OR: [{ phone: { in: parsed.valid.map((row) => row.phone) } }, { waId: { in: parsed.valid.map((row) => row.waId) } }] },
        select: { phone: true, waId: true },
      })
    : [];
  const existingKeys = new Set(existing.flatMap((contact) => [contact.phone, contact.waId]));
  const toCreate = parsed.valid.filter((row) => !existingKeys.has(row.phone) && !existingKeys.has(row.waId));

  if (toCreate.length) {
    await prisma.contact.createMany({ data: toCreate, skipDuplicates: true });
  }

  const report = {
    totalRows: parsed.valid.length + parsed.rejected.length,
    created: toCreate.length,
    duplicates: parsed.valid.length - toCreate.length,
    rejected: parsed.rejected.slice(0, 25),
    rejectedCount: parsed.rejected.length,
    truncated: parsed.truncated,
  };
  await writeAuditLog({ userId: session.userId, action: AUDIT_ACTIONS.CONTACT_CSV_IMPORTED, entityType: 'contact', metadata: report });
  revalidatePath('/contacts');
}

async function updateContact(formData: FormData) {
  'use server';
  const session = await requirePermission('contacts');
  const id = String(formData.get('id') ?? '');
  const displayName = String(formData.get('displayName') ?? '').trim() || null;
  const optInSource = String(formData.get('optInSource') ?? '').trim() || null;
  const tags = await validActiveControlledTagCodes(formData.getAll('tags'));
  const blocked = formData.get('blocked') === 'on';
  const unsubscribed = formData.get('unsubscribed') === 'on';

  if (!id) return;
  await prisma.contact.update({ where: { id }, data: { displayName, optInSource, tags, blocked, unsubscribed } });
  await writeAuditLog({ userId: session.userId, action: AUDIT_ACTIONS.CONTACT_UPDATED, entityType: 'contact', entityId: id });
  revalidatePath('/contacts');
}

export default async function ContactsPage({ searchParams }: { searchParams?: Promise<{ q?: string; page?: string }> }) {
  const session = await requirePermission('contacts');
  const params = await searchParams;
  const q = params?.q?.trim();
  const page = Math.max(1, Number.parseInt(params?.page ?? '1', 10) || 1);
  const pageSize = 20;

  const whereBase = session.role === 'ADMIN'
    ? {}
    : {
        OR: [
          { assignedOperatorId: session.userId },
          { conversations: { some: { assignedToId: session.userId } } },
          { conversations: { some: { assignedDepartment: { users: { some: { userId: session.userId } } } } } },
        ],
      };

  const where = q
    ? {
        AND: [
          whereBase,
          { OR: [
            { displayName: { contains: q, mode: 'insensitive' as const } },
            { phone: { contains: q } },
            { waId: { contains: q } },
            { tags: { has: q } },
          ]},
        ],
      }
    : whereBase;

  const [contacts, totalCount] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, displayName: true, phone: true, waId: true,
        tags: true, blocked: true, unsubscribed: true,
        optInSource: true, assignedOperatorId: true,
        conversations: { select: { id: true }, take: 1 },
      },
    }),
    prisma.contact.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / pageSize);
  const pageLinks: Array<{ label: string; page: number | null; active: boolean }> = [];
  if (page > 1) pageLinks.push({ label: '← Anterior', page: page - 1, active: false });
  for (let p = Math.max(1, page - 2); p <= Math.min(totalPages, page + 2); p++) {
    pageLinks.push({ label: String(p), page: p, active: p === page });
  }
  if (page < totalPages) pageLinks.push({ label: 'Siguiente →', page: page + 1, active: false });
  const latestImport = await prisma.auditLog.findFirst({ where: { action: AUDIT_ACTIONS.CONTACT_CSV_IMPORTED }, orderBy: { createdAt: 'desc' } });
  const activeTags = await listControlledTags();
  const tagNames = new Map(activeTags.map((tag) => [tag.code, tag.name]));
  const operators = session.role === 'ADMIN'
    ? await prisma.user.findMany({ where: { status: 'ACTIVE' }, orderBy: { email: 'asc' }, select: { id: true, email: true } })
    : await prisma.user.findMany({ where: { id: session.userId, status: 'ACTIVE' }, select: { id: true, email: true } });

  return (
    <div className="stack" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <section style={{ flexShrink: 0 }}>
        <p className="eyebrow">Agenda</p>
        <h2>Contactos</h2>
        <p>Buscá, cargá o importá contactos sin duplicar datos existentes.</p>
      </section>
      <section className="card stack" style={{ flexShrink: 0 }}>
        <ContactSearch currentQuery={q ?? ''} />
        <form className="grid-form" action={createContact}>
          <input name="displayName" placeholder="Nombre" />
          <input name="phone" placeholder="Teléfono" required />
          <input name="waId" placeholder="ID de WhatsApp (opcional)" />
          <input name="optInSource" placeholder="Origen del consentimiento" />
          <TagPillSelector name="tags" tags={activeTags} selected={[]} />
          <button type="submit">Crear contacto</button>
        </form>
        <CsvImporter />
        {latestImport ? <p className="notice">{formatLatestImport(latestImport.metadataJson)}</p> : null}
      </section>
      <section className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="table-card" style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {contacts.length ? <table>
          <thead>
              <tr><th>Nombre</th><th>Teléfono</th><th>Origen</th><th>Etiquetas</th><th>Estado</th><th>Operador</th><th></th></tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <EditableContactRow key={contact.id} contact={{ ...contact, conversationId: contact.conversations[0]?.id ?? null }} activeTags={activeTags} tagNames={tagNames} operators={operators} isAdmin={session.role === 'ADMIN'} />
              ))}
          </tbody>
        </table> : <p className="empty-state">Todavía no hay contactos para este filtro. Importe un CSV o  cree el primero manualmente.</p>}
        {totalPages > 1 && (
          <nav className="pagination" aria-label="Paginación de contactos">
            <small>{totalCount} contactos · pág. {page} de {totalPages}</small>
            <div className="pagination-links">
              {pageLinks.map((link) => (
                link.page !== null ? (
                  <Link
                    key={link.label}
                    href={`/contacts?${new URLSearchParams({ ...(q ? { q } : {}), page: String(link.page) }).toString()}`}
                    className={link.active ? 'pagination-link pagination-active' : 'pagination-link'}
                    scroll={false}
                  >
                    {link.label}
                  </Link>
                ) : (
                  <span key={link.label} className="pagination-link pagination-ellipsis">…</span>
                )
              ))}
            </div>
          </nav>
        )}
        </div>
      </section>
    </div>
  );
}
