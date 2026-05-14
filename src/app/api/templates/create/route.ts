import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import { getVerifiedSession } from '@/modules/auth/guards';
import { createWhatsAppCloudClient } from '@/modules/whatsapp/client';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Solo un administrador puede crear plantillas.' },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    language?: string;
    category?: string;
    headerFormat?: string;
    headerText?: string;
    headerUrl?: string;
    body?: string;
    footer?: string;
    buttons?: Array<{ text: string; type: string; url?: string }>;
  } | null;

  const name = body?.name?.trim();
  const language = body?.language?.trim() || 'es';
  const category = body?.category?.trim() || 'MARKETING';
  const bodyText = body?.body?.trim();
  const footerText = body?.footer?.trim();
  const headerText = body?.headerText?.trim();
  const headerFormat = body?.headerFormat || 'TEXT';
  const headerUrl = body?.headerUrl?.trim();
  const buttons = body?.buttons?.filter((b) => b.text?.trim()) ?? [];

  if (!name || !bodyText) {
    return NextResponse.json({ error: 'El nombre y el cuerpo son obligatorios.' }, { status: 400 });
  }

  const existing = await prisma.messageTemplate.findUnique({ where: { name } });
  if (existing) {
    return NextResponse.json({ error: 'Ya existe una plantilla con ese nombre.' }, { status: 400 });
  }

  try {
    const components: Record<string, unknown>[] = [];

    if (headerText) {
      components.push({ type: 'HEADER', format: 'TEXT', text: headerText });
    } else if (headerUrl) {
      components.push({
        type: 'HEADER',
        format: headerFormat,
        example: { header_handle: [headerUrl] },
      });
    }

    components.push({ type: 'BODY', text: bodyText });

    // Provide sample values for variables so Meta doesn't reject the template
    const variableMatches = bodyText.match(/\{\{(\d+)\}\}/g) ?? [];
    if (variableMatches.length > 0) {
      const sampleValues = variableMatches.map((_, i) => {
        if (i === 0) return 'María';
        if (i === 1) return '+502 5555-1234';
        return `valor${i + 1}`;
      });
      const bodyIdx = components.findIndex((c) => c.type === 'BODY');
      if (bodyIdx !== -1) {
        components[bodyIdx] = { ...components[bodyIdx], example: { body_text: [sampleValues] } };
      }
    }

    if (footerText) {
      components.push({ type: 'FOOTER', text: footerText });
    }

    if (buttons.length > 0) {
      components.push({
        type: 'BUTTONS',
        buttons: buttons.map((b) => {
          const btn: Record<string, string> = { type: b.type, text: b.text };
          if (b.type === 'URL' && b.url) btn.url = b.url;
          return btn;
        }),
      });
    }

    const client = createWhatsAppCloudClient();
    const result = await client.createMessageTemplate({ name, language, category, components });

    await prisma.messageTemplate.create({
      data: {
        metaId: result.id ?? null,
        name,
        language,
        category,
        body: bodyText,
        header: headerText || null,
        footer: footerText || null,
        buttonsJson: buttons.length > 0 ? (buttons as Prisma.InputJsonValue) : undefined,
        status: result.status || 'PENDING',
      },
    });

    await writeAuditLog({
      userId: session.userId,
      action: AUDIT_ACTIONS.CAMPAIGN_DRAFT_CREATED,
      entityType: 'message_template',
      entityId: result.id,
      metadata: { name, language, category },
    });

    return NextResponse.json({ ok: true, metaId: result.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al crear plantilla.' },
      { status: 500 },
    );
  }
}
