import type { Prisma } from '@prisma/client';

import type { AppSession } from '@/modules/auth/session';

export interface ComprobantesFilters {
  status?: string;
  from?: Date;
  to?: Date;
  comprobante?: boolean;
}

export function buildComprobantesWhere(
  session: AppSession,
  filters: ComprobantesFilters,
): Prisma.MediaAssetWhereInput {
  const where: Prisma.MediaAssetWhereInput = {
    isComprobante: filters.comprobante ?? true,
  };

  if (session.role !== 'ADMIN') {
    where.markedById = session.userId;
  }

  if (filters.status) {
    where.downloadStatus = filters.status as 'PENDING' | 'DOWNLOADING' | 'READY' | 'FAILED';
  }

  if (filters.from || filters.to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (filters.from) createdAt.gte = filters.from;
    if (filters.to) createdAt.lte = filters.to;
    where.createdAt = createdAt;
  }

  return where;
}
