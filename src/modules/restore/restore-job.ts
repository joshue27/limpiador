import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export const RESTORE_RUN_STATUSES = ['PENDING', 'RUNNING', 'READY', 'FAILED'] as const;
export type RestoreRunStatus = (typeof RESTORE_RUN_STATUSES)[number];

export type RestoreCounts = {
  conversationsRestored: number;
  messagesRestored: number;
  mediaRestored: number;
};

export type RestoreRunRow = {
  id: string;
  status: RestoreRunStatus;
  progress: number;
  counts_json: unknown;
  error: string | null;
  updated_at: Date;
};

type Queryable = {
  $queryRaw(query: Prisma.Sql): Promise<unknown>;
};

type Executable = {
  $executeRaw(query: Prisma.Sql): Promise<number>;
};

export async function createRestoreRun(input: {
  prisma: Queryable;
  userId: string;
  archiveKey: string;
  originalFilename: string;
}): Promise<{ id: string; status: RestoreRunStatus }> {
  const id = randomUUID();
  const rows = await input.prisma.$queryRaw(Prisma.sql`
    INSERT INTO restore_runs (id, created_by, archive_key, original_filename, status, progress)
    VALUES (${id}, ${input.userId}, ${input.archiveKey}, ${input.originalFilename}, 'PENDING', 0)
    RETURNING id
  `) as Array<{ id: string }>;

  const createdId = rows[0]?.id;
  if (!createdId) throw new Error('No se pudo crear el registro de restauración.');
  return { id: createdId, status: 'PENDING' };
}

export async function markRestoreRunRunning(prisma: Executable, id: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE restore_runs
    SET status = 'RUNNING', progress = 10, started_at = COALESCE(started_at, now()), updated_at = now()
    WHERE id = ${id}
  `);
}

export async function markRestoreRunReady(prisma: Executable, id: string, counts: RestoreCounts): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE restore_runs
    SET status = 'READY', progress = 100, counts_json = ${counts}, completed_at = now(), updated_at = now(), error = NULL
    WHERE id = ${id}
  `);
}

export async function markRestoreRunFailed(prisma: Executable, id: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : 'Unknown restore error';
  await prisma.$executeRaw(Prisma.sql`
    UPDATE restore_runs
    SET status = 'FAILED', progress = 100, error = ${message.slice(0, 500)}, completed_at = now(), updated_at = now()
    WHERE id = ${id}
  `);
}

export async function getRestoreRunStatus(prisma: Queryable, id: string): Promise<ReturnType<typeof formatRestoreStatus> | null> {
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT id, status, progress, counts_json, error, updated_at
    FROM restore_runs
    WHERE id = ${id}
    LIMIT 1
  `) as RestoreRunRow[];
  const row = rows[0];
  return row ? formatRestoreStatus(row) : null;
}

export function formatRestoreStatus(row: RestoreRunRow) {
  return {
    id: row.id,
    status: row.status,
    progress: row.progress,
    counts: isRestoreCounts(row.counts_json) ? row.counts_json : null,
    error: row.error,
    updatedAt: row.updated_at.toISOString(),
  };
}

function isRestoreCounts(value: unknown): value is RestoreCounts {
  return (
    typeof value === 'object' &&
    value !== null &&
    'conversationsRestored' in value &&
    'messagesRestored' in value &&
    'mediaRestored' in value &&
    typeof value.conversationsRestored === 'number' &&
    typeof value.messagesRestored === 'number' &&
    typeof value.mediaRestored === 'number'
  );
}
