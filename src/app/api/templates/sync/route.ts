import { NextResponse } from 'next/server';
import { safeRedirect } from '@/lib/safe-redirect';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { getVerifiedSession } from '@/modules/auth/guards';
import { createWhatsAppCloudClient } from '@/modules/whatsapp/client';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.redirect(safeRedirect(request, '/templates'), { status: 303 });
  }

  try {
    const client = createWhatsAppCloudClient();
    const response = await client.listMessageTemplates();

    for (const meta of response.data ?? []) {
      const bodyComponent = meta.components?.find((c) => c.type === 'BODY');
      const headerComponent = meta.components?.find((c) => c.type === 'HEADER');
      const footerComponent = meta.components?.find((c) => c.type === 'FOOTER');

      await prisma.messageTemplate.upsert({
        where: { name: meta.name },
        create: {
          metaId: meta.id,
          name: meta.name,
          language: meta.language,
          category: meta.category,
          body: bodyComponent?.text ?? '',
          header: headerComponent?.text ?? null,
          footer: footerComponent?.text ?? null,
          status: meta.status || 'PENDING',
        },
        update: {
          metaId: meta.id,
          status: meta.status || 'PENDING',
          language: meta.language,
          category: meta.category,
          body: bodyComponent?.text ?? undefined,
          header: headerComponent?.text ?? null,
          footer: footerComponent?.text ?? null,
        },
      });
    }

    revalidatePath('/templates');
    return NextResponse.redirect(safeRedirect(request, '/templates'), { status: 303 });
  } catch {
    return NextResponse.redirect(safeRedirect(request, '/templates'), { status: 303 });
  }
}
