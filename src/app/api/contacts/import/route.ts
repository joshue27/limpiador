import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import { getVerifiedSession } from '@/modules/auth/guards';
import { listControlledTags } from '@/modules/tags/controlled-tags';

export const runtime = 'nodejs';

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

export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { csv?: string } | null;
  const csv = body?.csv?.trim();
  if (!csv) {
    return NextResponse.json({ error: 'El CSV está vacío.' }, { status: 400 });
  }

  const activeTags = await listControlledTags();
  const activeTagCodes = new Set(activeTags.map((t) => t.code));

  const rows = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const first = rows[0] ? parseCsvLine(rows[0]).map((c) => c.toLowerCase()) : [];
  const hasHeader = first.includes('phone') || first.includes('telefono');
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const header = hasHeader ? first : ['phone', 'display_name', 'wa_id', 'opt_in_source', 'tags'];

  const idx = (names: string[]) => names.map((n) => header.indexOf(n)).find((p) => p >= 0) ?? -1;
  const phoneIdx = idx(['phone', 'telefono']);
  const nameIdx = idx(['display_name', 'name', 'nombre']);
  const waIdIdx = idx(['wa_id', 'waid']);
  const sourceIdx = idx(['opt_in_source', 'source', 'origen']);
  const tagsIdx = idx(['tags', 'tag']);

  const valid: Array<{ phone: string; waId: string; displayName: string | null; optInSource: string | null; tags: string[] }> = [];
  const rejected: Array<{ row: number; reason: string }> = [];
  const seen = new Set<string>();

  dataRows.slice(0, 1000).forEach((line, i) => {
    const cells = parseCsvLine(line);
    const phone = cleanPhone(cells[phoneIdx] ?? cells[0] ?? '');
    const waId = cleanPhone(cells[waIdIdx] ?? phone);
    const rowNumber = i + (hasHeader ? 2 : 1);

    if (!phonePattern.test(phone) || !phonePattern.test(waId)) {
      rejected.push({ row: rowNumber, reason: 'Teléfono inválido' });
      return;
    }
    if (seen.has(phone) || seen.has(waId)) {
      rejected.push({ row: rowNumber, reason: 'Duplicado en el archivo' });
      return;
    }
    seen.add(phone);
    seen.add(waId);

    valid.push({
      phone,
      waId,
      displayName: (cells[nameIdx] ?? '').trim() || null,
      optInSource: (cells[sourceIdx] ?? '').trim() || 'csv-import',
      tags: (cells[tagsIdx] ?? '').split(/[;,]/).map((t) => t.trim()).filter((t) => activeTagCodes.has(t)).slice(0, 12),
    });
  });

  const existing = valid.length
    ? await prisma.contact.findMany({
        where: { OR: [{ phone: { in: valid.map((r) => r.phone) } }, { waId: { in: valid.map((r) => r.waId) } }] },
        select: { phone: true, waId: true },
      })
    : [];
  const existingKeys = new Set(existing.flatMap((c) => [c.phone, c.waId]));
  const toCreate = valid.filter((r) => !existingKeys.has(r.phone) && !existingKeys.has(r.waId));

  if (toCreate.length) {
    await prisma.contact.createMany({ data: toCreate, skipDuplicates: true });
  }

  const report = {
    created: toCreate.length,
    duplicates: valid.length - toCreate.length,
    rejectedCount: rejected.length,
    rejected: rejected.slice(0, 25),
    truncated: dataRows.length > 1000,
  };

  await writeAuditLog({
    userId: session.userId,
    action: AUDIT_ACTIONS.CONTACT_CSV_IMPORTED,
    entityType: 'contact',
    metadata: report,
  });

  return NextResponse.json({ ok: true, report });
}
