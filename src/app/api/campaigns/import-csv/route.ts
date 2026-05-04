import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { getVerifiedSession } from '@/modules/auth/guards';
import { listControlledTags } from '@/modules/tags/controlled-tags';

export const runtime = 'nodejs';

const phonePattern = /^\+?[1-9][0-9]{7,14}$/;

function cleanPhone(value: string) {
  return value.replace(/[\s().-]/g, '').trim();
}

export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const formData = await request.formData();
  const csvFile = formData.get('csv') as File | null;
  const campaignId = String(formData.get('campaignId') ?? '').trim();
  if (!csvFile || csvFile.size === 0) {
    return NextResponse.json({ error: 'Archivo CSV requerido' }, { status: 400 });
  }

  const text = await csvFile.text();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    return NextResponse.json({ error: 'CSV vacío o solo tiene encabezado' }, { status: 400 });
  }

  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const idx = (names: string[]) => names.map(n => header.indexOf(n)).find(p => p >= 0) ?? -1;
  const phoneIdx = idx(['phone', 'telefono']);
  const nameIdx = idx(['display_name', 'name', 'nombre']);
  const waIdIdx = idx(['wa_id', 'waid']);

  const activeTags = await listControlledTags();
  const activeTagCodes = new Set(activeTags.map(t => t.code));
  const tagsIdx = idx(['tags', 'tag']);

  const valid: Array<{ phone: string; waId: string; displayName: string | null; optInSource: string; tags: string[]; csvData: Record<string, string> }> = [];
  const seen = new Set<string>();
  let errors = 0;

  for (let i = 1; i < lines.length && valid.length < 1000; i++) {
    const cells = lines[i].split(',').map(c => c.trim());
    const phone = cleanPhone(cells[phoneIdx] ?? cells[0] ?? '');
    const waId = cleanPhone(cells[waIdIdx] ?? phone);

    if (!phonePattern.test(phone)) { errors++; continue; }
    if (seen.has(phone)) { errors++; continue; }
    seen.add(phone);

    // Build csvData with all columns (header → value)
    const csvData: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      if (cells[c]) csvData[header[c]] = cells[c];
    }

    valid.push({
      phone,
      waId,
      displayName: (cells[nameIdx] ?? '').trim() || null,
      optInSource: 'csv-upload',
      tags: (cells[tagsIdx] ?? '').split(/[;,]/).map(t => t.trim()).filter(t => activeTagCodes.has(t)).slice(0, 12),
      csvData,
    });
  }

  const existing = valid.length
    ? await prisma.contact.findMany({
        where: { OR: [{ phone: { in: valid.map(r => r.phone) } }, { waId: { in: valid.map(r => r.waId) } }] },
        select: { phone: true },
      })
    : [];
  const existingPhones = new Set(existing.map(c => c.phone));
  const toCreate = valid.filter(r => !existingPhones.has(r.phone));

  if (toCreate.length) {
    await prisma.contact.createMany({ data: toCreate, skipDuplicates: true });
  }

  // Get all contact IDs (new + existing) and add to campaign if specified
  const allPhones = valid.map(r => r.phone);
  const allContacts = allPhones.length
    ? await prisma.contact.findMany({ where: { phone: { in: allPhones } }, select: { id: true, phone: true } })
    : [];

  let addedToCampaign = 0;
  if (campaignId && allContacts.length > 0) {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (campaign && campaign.status === 'DRAFT') {
      const csvDataByPhone = new Map(valid.map(r => [r.phone, r.csvData]));
      const importedContactIds = allContacts.map(contact => contact.id);
      const contactPhoneById = new Map(allContacts.map(contact => [contact.id, contact.phone]));
      const existingRecipients = await prisma.campaignRecipient.findMany({
        where: {
          campaignId,
          contactId: { in: importedContactIds },
        },
        select: { id: true, contactId: true },
      });

      await prisma.campaignRecipient.createMany({
        data: allContacts.map(contact => ({
          campaignId,
          contactId: contact.id,
          csvData: csvDataByPhone.get(contact.phone) ?? undefined,
        })),
        skipDuplicates: true,
      });

      const existingRecipientUpdates = existingRecipients.flatMap((recipient) => {
        const phone = contactPhoneById.get(recipient.contactId);
        const data = phone ? csvDataByPhone.get(phone) : undefined;
        return data
          ? [{
              where: { id: recipient.id },
              data: { csvData: data },
            }]
          : [];
      });

      if (existingRecipientUpdates.length > 0) {
        await Promise.all(existingRecipientUpdates.map((updateArgs) => prisma.campaignRecipient.update(updateArgs)));
      }

      addedToCampaign = allContacts.length;
    }
  }

  revalidatePath('/campaigns');
  return NextResponse.json({
    ok: true,
    created: toCreate.length,
    existing: valid.length - toCreate.length,
    errors,
    total: valid.length,
    addedToCampaign,
  });
}
