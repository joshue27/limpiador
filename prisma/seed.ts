import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_INBOX = {
  waId: '5491100000001-DEMO-INBOX',
  phone: '+54 9 11 0000-0001 DEMO',
  displayName: 'Demo Inbox - Cliente Eliminable',
  tag: 'DEMO_INBOX_SEED',
  optInSource: 'demo-seed-local',
  inboundWamid: 'wamid.demo-inbox.inbound.001',
  outboundWamid: 'wamid.demo-inbox.outbound.001',
  followupWamid: 'wamid.demo-inbox.inbound.002',
} as const;

export const DEFAULT_DEPARTMENTS = [
  { code: 'ATENCION_ESTUDIANTE', name: 'Atención al Estudiante', sortOrder: 1 },
  { code: 'CONTABILIDAD', name: 'Contabilidad', sortOrder: 2 },
  { code: 'COORDINACION_ACADEMICA', name: 'Coordinación Académica', sortOrder: 3 },
  { code: 'VENTAS', name: 'Ventas', sortOrder: 4 },
  { code: 'INFORMATICA', name: 'Informática', sortOrder: 5 },
] as const;

export const DEFAULT_CONTROLLED_TAGS = [
  { code: 'DEMO_INBOX_SEED', name: 'Demo Inbox' },
  { code: 'DEMO', name: 'Demo' },
  { code: 'INBOX', name: 'Inbox' },
  { code: 'INTERESADO', name: 'Interesado' },
  { code: 'CLIENTE_ACTIVO', name: 'Cliente activo' },
] as const;

async function main() {
  for (const department of DEFAULT_DEPARTMENTS) {
    await prisma.department.upsert({
      where: { code: department.code },
      create: department,
      update: { name: department.name, sortOrder: department.sortOrder, active: true },
    });
  }

  await seedControlledTags();

  if (shouldDeleteInboxDemo()) {
    await deleteInboxDemo();
    return;
  }

  if (shouldSeedInboxDemo()) {
    await seedInboxDemo();
  }
}

async function seedControlledTags() {
  for (const tag of DEFAULT_CONTROLLED_TAGS) {
    await prisma.$executeRaw`
      INSERT INTO controlled_tags (id, code, name, active, created_at, updated_at)
      VALUES (${randomUUID()}, ${tag.code}, ${tag.name}, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name,
            active = true,
            updated_at = CURRENT_TIMESTAMP
    `;
  }
}

function shouldSeedInboxDemo() {
  return process.argv.includes('--demo-inbox') || process.env.SEED_DEMO_INBOX === 'true';
}

function shouldDeleteInboxDemo() {
  return process.argv.includes('--delete-demo-inbox') || process.env.SEED_DEMO_INBOX === 'delete';
}

async function seedInboxDemo() {
  const now = new Date();
  const firstInboundAt = new Date(now.getTime() - 1000 * 60 * 25);
  const outboundAt = new Date(now.getTime() - 1000 * 60 * 18);
  const followupAt = new Date(now.getTime() - 1000 * 60 * 6);

  const contact = await prisma.contact.upsert({
    where: { waId: DEMO_INBOX.waId },
    create: {
      waId: DEMO_INBOX.waId,
      phone: DEMO_INBOX.phone,
      displayName: DEMO_INBOX.displayName,
      optInSource: DEMO_INBOX.optInSource,
      tags: [DEMO_INBOX.tag, 'demo', 'inbox'],
      lastInboundAt: followupAt,
    },
    update: {
      phone: DEMO_INBOX.phone,
      displayName: DEMO_INBOX.displayName,
      optInSource: DEMO_INBOX.optInSource,
      tags: [DEMO_INBOX.tag, 'demo', 'inbox'],
      unsubscribed: false,
      blocked: false,
      lastInboundAt: followupAt,
    },
  });

  const conversation = await prisma.conversation.upsert({
    where: { contactId: contact.id },
    create: {
      contactId: contact.id,
      status: 'UNASSIGNED',
      lastMessageAt: followupAt,
      unreadCount: 2,
    },
    update: {
      status: 'UNASSIGNED',
      assignedDepartmentId: null,
      assignedToId: null,
      lastMessageAt: followupAt,
      unreadCount: 2,
    },
  });

  await prisma.message.upsert({
    where: { wamid: DEMO_INBOX.inboundWamid },
    create: {
      wamid: DEMO_INBOX.inboundWamid,
      contactId: contact.id,
      conversationId: conversation.id,
      direction: 'INBOUND',
      type: 'TEXT',
      body: 'Hola, quiero consultar por una inscripción. Este chat es DEMO y se puede borrar.',
      status: 'RECEIVED',
      receivedAt: firstInboundAt,
      createdAt: firstInboundAt,
    },
    update: {},
  });

  await prisma.message.upsert({
    where: { wamid: DEMO_INBOX.outboundWamid },
    create: {
      wamid: DEMO_INBOX.outboundWamid,
      contactId: contact.id,
      conversationId: conversation.id,
      direction: 'OUTBOUND',
      type: 'TEXT',
      body: '¡Hola! Te ayudamos por acá. ¿Sobre qué curso querés consultar?',
      status: 'SENT',
      sentAt: outboundAt,
      createdAt: outboundAt,
    },
    update: {},
  });

  await prisma.message.upsert({
    where: { wamid: DEMO_INBOX.followupWamid },
    create: {
      wamid: DEMO_INBOX.followupWamid,
      contactId: contact.id,
      conversationId: conversation.id,
      direction: 'INBOUND',
      type: 'TEXT',
      body: 'Me interesa probar el área de Inbox con esta conversación semilla.',
      status: 'RECEIVED',
      receivedAt: followupAt,
      createdAt: followupAt,
    },
    update: {},
  });

  console.info(`Demo Inbox lista: contacto ${contact.waId}, conversación ${conversation.id}`);
}

async function deleteInboxDemo() {
  const result = await prisma.contact.deleteMany({
    where: {
      waId: DEMO_INBOX.waId,
      phone: DEMO_INBOX.phone,
      tags: { has: DEMO_INBOX.tag },
    },
  });

  console.info(`Demo Inbox eliminada: ${result.count} contacto(s) demo borrado(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
