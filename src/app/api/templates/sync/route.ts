import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { safeRedirect } from '@/lib/safe-redirect';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/modules/auth/guards';
import { createWhatsAppCloudClient } from '@/modules/whatsapp/client';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await requirePermission('templates');

  try {
    const client = createWhatsAppCloudClient();
    const response = await client.listMessageTemplates();

    for (const meta of response.data ?? []) {
      const bodyComponent = meta.components?.find((c) => c.type === 'BODY');
      const headerComponent = meta.components?.find((c) => c.type === 'HEADER');
      const footerComponent = meta.components?.find((c) => c.type === 'FOOTER');
      const buttonsComponent = meta.components?.find((c) => c.type === 'BUTTONS') as
        | {
            buttons?: Array<{ type?: string; text?: string; url?: string }>;
          }
        | undefined;
      const buttons =
        buttonsComponent?.buttons
          ?.filter((button) => button.text?.trim())
          .map((button) => ({
            type: button.type?.trim() || 'QUICK_REPLY',
            text: button.text?.trim() || '',
            url: button.url?.trim() || undefined,
          })) ?? [];

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
          buttonsJson: buttons.length > 0 ? (buttons as Prisma.InputJsonValue) : undefined,
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
          buttonsJson: buttons.length > 0 ? (buttons as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      });
    }

    revalidatePath('/templates');
    return NextResponse.redirect(safeRedirect(request, '/templates'), { status: 303 });
  } catch {
    return NextResponse.redirect(safeRedirect(request, '/templates'), { status: 303 });
  }
}
