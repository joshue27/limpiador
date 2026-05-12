import { prisma } from '@/lib/prisma';
import { enqueueRestoreProcessing } from '@/modules/queue/queues';
import { createRestoreRun, markRestoreRunFailed } from '@/modules/restore/restore-job';

export async function queueRestoreArchive(input: {
  archivePath: string;
  archiveKey: string;
  originalFilename: string;
  userId: string;
}) {
  const restoreRun = await createRestoreRun({
    prisma,
    userId: input.userId,
    archiveKey: input.archiveKey,
    originalFilename: input.originalFilename,
  });

  try {
    await enqueueRestoreProcessing(restoreRun.id, input.archivePath, input.userId);
  } catch (error) {
    await markRestoreRunFailed(prisma, restoreRun.id, error);
    throw error;
  }

  return restoreRun;
}
