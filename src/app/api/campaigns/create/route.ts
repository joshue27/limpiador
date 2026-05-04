import { NextResponse } from 'next/server';
import { safeRedirect } from '@/lib/safe-redirect';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import { getVerifiedSession } from '@/modules/auth/guards';

export const runtime = 'nodejs';

function extractPlaceholders(body: string): string[] {
  const tokens = new Set<string>();
  const re = /\{\{(\d+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    tokens.add(match[1]);
  }
  return [...tokens].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
}

export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.redirect(safeRedirect(request, '/campaigns'), { status: 303 });
  }

  const formData = await request.formData();
  const name = String(formData.get('name') ?? '').trim();
  const templateName = String(formData.get('templateName') ?? '').trim();
  const templateLanguage = String(formData.get('templateLanguage') ?? 'es').trim();
  const confirmation = String(formData.get('confirmation') ?? '').trim().toUpperCase();
  const includeAudience = formData.get('includeAudience') === 'on';

  if (!name || !templateName || !templateLanguage || confirmation !== 'BORRADOR') {
    return NextResponse.redirect(safeRedirect(request, '/campaigns'), { status: 303 });
  }

  // Auto-generate default placeholder mapping from template body.
  // {{1}} → display_name, {{2}} → phone by default.
  // Custom columns ({{5}}, {{6}}, etc.) start empty — set via UI or API.
  const template = await prisma.messageTemplate.findUnique({
    where: { name: templateName },
    select: { body: true },
  });
  const placeholderNums = extractPlaceholders(template?.body ?? '');
  const DEFAULT_MAP: Record<string, string> = { '1': 'display_name', '2': 'phone' };
  const bodyPlaceholderMap: Record<string, string> = {};
  for (const token of placeholderNums) {
    bodyPlaceholderMap[token] = DEFAULT_MAP[token] ?? '';
  }

  const campaign = await prisma.campaign.create({
    data: { name, templateName, templateLanguage, createdById: session.userId, bodyPlaceholderMap },
  });
  let recipientsPrepared = 0;

  if (includeAudience) {
    const contacts = await prisma.contact.findMany({
      where: { blocked: false, unsubscribed: false },
      select: { id: true },
      take: 1000,
    });
    if (contacts.length) {
      await prisma.campaignRecipient.createMany({
        data: contacts.map((contact) => ({ campaignId: campaign.id, contactId: contact.id })),
        skipDuplicates: true,
      });
      recipientsPrepared = contacts.length;
    }
  }

  await writeAuditLog({
    userId: session.userId,
    action: AUDIT_ACTIONS.CAMPAIGN_DRAFT_CREATED,
    entityType: 'campaign',
    entityId: campaign.id,
    metadata: { recipientsPrepared },
  });

  revalidatePath('/campaigns');
  return NextResponse.redirect(safeRedirect(request, '/campaigns'), { status: 303 });
}
