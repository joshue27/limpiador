import { PrismaClient } from '@prisma/client';

export function createTestPrismaClient() {
  return new PrismaClient({
    datasources: {
      db: {
        url: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
      },
    },
  });
}

export async function truncateCoreTables(prisma: PrismaClient) {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.campaignRecipient.deleteMany(),
    prisma.campaign.deleteMany(),
    prisma.exportRun.deleteMany(),
    prisma.mediaAsset.deleteMany(),
    prisma.messageStatusEvent.deleteMany(),
    prisma.message.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.contact.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}
