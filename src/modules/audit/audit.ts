import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import type { AuditAction } from './actions';

export type AuditInput = {
  userId?: string | null;
  action: AuditAction | string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Prisma.InputJsonObject;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function writeAuditLog(input: AuditInput) {
  return prisma.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      metadataJson: input.metadata ?? undefined,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}
