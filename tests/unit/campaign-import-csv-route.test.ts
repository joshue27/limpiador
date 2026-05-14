import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  listControlledTags: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    contact: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    campaign: {
      findUnique: vi.fn(),
    },
    campaignRecipient: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/modules/auth/guards', () => ({ requirePermission: mocks.requirePermission }));
vi.mock('@/modules/tags/controlled-tags', () => ({ listControlledTags: mocks.listControlledTags }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

describe('campaign CSV import route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ userId: 'admin-1', role: 'ADMIN' });
    mocks.listControlledTags.mockResolvedValue([{ code: 'vip' }]);
    mocks.prisma.contact.createMany.mockResolvedValue({ count: 1 });
    mocks.prisma.campaign.findUnique.mockResolvedValue({ id: 'campaign-1', status: 'DRAFT' });
    mocks.prisma.campaignRecipient.createMany.mockResolvedValue({ count: 1 });
    mocks.prisma.campaignRecipient.update.mockResolvedValue(undefined);
  });

  it('limits csvData updates to recipients in the imported subset', async () => {
    mocks.prisma.contact.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'contact-1', phone: '+50255550000' }]);
    mocks.prisma.campaignRecipient.findMany.mockResolvedValue([{ id: 'recipient-1', contactId: 'contact-1' }]);

    const { POST } = await import('@/app/api/campaigns/import-csv/route');
    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(mocks.prisma.campaignRecipient.findMany).toHaveBeenCalledWith({
      where: {
        campaignId: 'campaign-1',
        contactId: { in: ['contact-1'] },
      },
      select: { id: true, contactId: true },
    });
    expect(mocks.prisma.campaignRecipient.createMany).toHaveBeenCalledWith({
      data: [
        {
          campaignId: 'campaign-1',
          contactId: 'contact-1',
          csvData: {
            name: 'Ada Lovelace',
            phone: '+50255550000',
            tags: 'vip',
          },
        },
      ],
      skipDuplicates: true,
    });
    expect(mocks.prisma.campaignRecipient.update).toHaveBeenCalledWith({
      where: { id: 'recipient-1' },
      data: {
        csvData: {
          name: 'Ada Lovelace',
          phone: '+50255550000',
          tags: 'vip',
        },
      },
    });
  });
});

function createRequest() {
  const formData = new FormData();
  formData.set('campaignId', 'campaign-1');
  formData.set('csv', new File([
    'phone,name,tags\n+50255550000,Ada Lovelace,vip',
  ], 'contacts.csv', { type: 'text/csv' }));
  return new Request('http://localhost/api/campaigns/import-csv', { method: 'POST', body: formData });
}
