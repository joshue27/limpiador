import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    conversation: {
      findUnique: vi.fn(),
      update: vi.fn(async () => undefined),
    },
    user: {
      findFirst: vi.fn(),
    },
    message: {
      create: vi.fn(async () => undefined),
    },
    department: {
      findUnique: vi.fn(),
    },
  },
  writeAuditLog: vi.fn(async () => undefined),
  sendText: vi.fn(async () => ({ messages: [{ id: 'wamid-menu-1' }] })),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/modules/audit/audit', () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock('@/modules/whatsapp/client', () => ({
  createWhatsAppCloudClient: () => ({ sendText: mocks.sendText }),
}));

import { routeInboundTextMessage } from '@/modules/inbox/routing';

describe('routeInboundTextMessage template-opened windows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.user.findFirst.mockResolvedValue(null);
    mocks.prisma.department.findUnique.mockResolvedValue(null);
  });

  it('no envía el menú de departamentos si la conversación sin asignar sigue dentro de una ventana abierta por plantilla', async () => {
    const previousWindowOpenedAt = new Date('2026-04-24T12:00:00.000Z');
    const receivedAt = new Date('2026-04-24T18:00:00.000Z');
    mocks.prisma.conversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      status: 'UNASSIGNED',
      assignedDepartmentId: null,
      assignedToId: null,
    });

    const result = await routeInboundTextMessage({
      conversationId: 'conv-1',
      contactWaId: '5491112345678',
      inboundMessageId: 'msg-1',
      previousWindowOpenedAt,
      previousWindowOpenedBy: 'TEMPLATE',
      receivedAt,
    });

    expect(result).toEqual({ routed: false, reason: 'template_window_active' });
    expect(mocks.sendText).not.toHaveBeenCalled();
    expect(mocks.prisma.conversation.update).not.toHaveBeenCalled();
    expect(mocks.prisma.message.create).not.toHaveBeenCalled();
  });

  it('sí envía el menú cuando la ventana activa fue abierta por el cliente aunque luego haya plantillas salientes', async () => {
    const previousWindowOpenedAt = new Date('2026-04-24T12:00:00.000Z');
    const receivedAt = new Date('2026-04-24T18:00:00.000Z');
    mocks.prisma.conversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      status: 'UNASSIGNED',
      assignedDepartmentId: null,
      assignedToId: null,
    });

    const result = await routeInboundTextMessage({
      conversationId: 'conv-1',
      contactWaId: '5491112345678',
      inboundMessageId: 'msg-1',
      previousWindowOpenedAt,
      previousWindowOpenedBy: 'INBOUND',
      receivedAt,
    });

    expect(result).toEqual({ routed: true, action: 'menu_sent' });
    expect(mocks.sendText).toHaveBeenCalledWith({
      to: '5491112345678',
      body: expect.stringContaining('¿Con qué área quiere comunicarse?'),
    });
    expect(mocks.prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { status: 'MENU_PENDING' },
    });
  });

  it('sí envía el menú si no hay una apertura previa registrada', async () => {
    mocks.prisma.conversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      status: 'UNASSIGNED',
      assignedDepartmentId: null,
      assignedToId: null,
    });

    const result = await routeInboundTextMessage({
      conversationId: 'conv-1',
      contactWaId: '5491112345678',
      inboundMessageId: 'msg-1',
      receivedAt: new Date('2026-04-24T18:00:00.000Z'),
    });

    expect(result).toEqual({ routed: true, action: 'menu_sent' });
    expect(mocks.sendText).toHaveBeenCalledOnce();
  });
});
