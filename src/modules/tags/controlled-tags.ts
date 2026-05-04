import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

export type ControlledTagRow = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type ControlledTagDbRow = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
};

export function normalizeTagCode(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

function mapRow(row: ControlledTagDbRow): ControlledTagRow {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listControlledTags(options: { includeInactive?: boolean } = {}) {
  const rows = options.includeInactive
    ? await prisma.$queryRaw<ControlledTagDbRow[]>`
        SELECT id, code, name, active, created_at, updated_at
        FROM controlled_tags
        ORDER BY active DESC, name ASC
      `
    : await prisma.$queryRaw<ControlledTagDbRow[]>`
        SELECT id, code, name, active, created_at, updated_at
        FROM controlled_tags
        WHERE active = true
        ORDER BY name ASC
      `;

  return rows.map(mapRow);
}

export async function validActiveControlledTagCodes(values: Iterable<FormDataEntryValue | string>) {
  const activeTags = await listControlledTags();
  const activeCodes = new Set(activeTags.map((tag) => tag.code));
  const selected = new Set<string>();

  for (const value of values) {
    const code = String(value).trim();
    if (activeCodes.has(code)) selected.add(code);
  }

  return Array.from(selected).slice(0, 12);
}

export async function createControlledTag(name: string) {
  const cleanName = name.trim().replace(/\s+/g, ' ').slice(0, 80);
  const code = normalizeTagCode(cleanName);
  if (!cleanName || !code) throw new Error('invalid_tag_name');

  const [row] = await prisma.$queryRaw<ControlledTagDbRow[]>`
    INSERT INTO controlled_tags (id, code, name, active, created_at, updated_at)
    VALUES (${randomUUID()}, ${code}, ${cleanName}, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name,
          active = true,
          updated_at = CURRENT_TIMESTAMP
    RETURNING id, code, name, active, created_at, updated_at
  `;

  return mapRow(row);
}

export async function updateControlledTagName(id: string, name: string) {
  const cleanName = name.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!cleanName) throw new Error('invalid_tag_name');

  const [row] = await prisma.$queryRaw<ControlledTagDbRow[]>`
    UPDATE controlled_tags
    SET name = ${cleanName}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING id, code, name, active, created_at, updated_at
  `;

  return row ? mapRow(row) : null;
}

export async function setControlledTagActive(id: string, active: boolean) {
  const [row] = await prisma.$queryRaw<ControlledTagDbRow[]>`
    UPDATE controlled_tags
    SET active = ${active}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING id, code, name, active, created_at, updated_at
  `;

  return row ? mapRow(row) : null;
}

export async function countContactsUsingControlledTag(code: string) {
  return prisma.contact.count({
    where: {
      tags: { has: code },
    },
  });
}

export async function deleteControlledTagSafely(id: string) {
  const [existing] = await prisma.$queryRaw<ControlledTagDbRow[]>`
    SELECT id, code, name, active, created_at, updated_at
    FROM controlled_tags
    WHERE id = ${id}
    LIMIT 1
  `;

  if (!existing) {
    return { status: 'not_found' as const };
  }

  const usageCount = await countContactsUsingControlledTag(existing.code);
  if (usageCount > 0) {
    return {
      status: 'in_use' as const,
      tag: mapRow(existing),
      usageCount,
    };
  }

  const [deleted] = await prisma.$queryRaw<ControlledTagDbRow[]>`
    DELETE FROM controlled_tags
    WHERE id = ${id}
    RETURNING id, code, name, active, created_at, updated_at
  `;

  if (!deleted) {
    return { status: 'not_found' as const };
  }

  return {
    status: 'deleted' as const,
    tag: mapRow(deleted),
    usageCount: 0,
  };
}
