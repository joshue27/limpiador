import type { Prisma } from '@prisma/client';

export type AuditFilterParams = {
  from?: string;
  to?: string;
  action?: string;
  user?: string;
  entityType?: string;
  entityId?: string;
};

function parseDate(value: string | undefined, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function auditWhereFromParams(params: AuditFilterParams): Prisma.AuditLogWhereInput {
  const from = parseDate(params.from);
  const to = parseDate(params.to, true);
  const action = params.action?.trim();
  const user = params.user?.trim();
  const entityType = params.entityType?.trim();
  const entityId = params.entityId?.trim();

  return {
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
    ...(user
      ? {
          user: {
            email: { contains: user, mode: 'insensitive' },
          },
        }
      : {}),
  };
}

export function auditParamsFromUrl(searchParams: URLSearchParams): AuditFilterParams {
  return {
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
    action: searchParams.get('action') ?? undefined,
    user: searchParams.get('user') ?? undefined,
    entityType: searchParams.get('entityType') ?? undefined,
    entityId: searchParams.get('entityId') ?? undefined,
  };
}
