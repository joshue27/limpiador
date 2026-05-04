import { NextResponse } from 'next/server';
import { safeRedirect } from '@/lib/safe-redirect';

import { prisma } from '@/lib/prisma';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import { getVerifiedSession } from '@/modules/auth/guards';

export const runtime = 'nodejs';

const phonePattern = /^\+?[1-9][0-9]{7,14}$/;

function cleanPhone(value: string) {
  return value.replace(/[\s().-]/g, '').trim();
}

function redirectToInbox(request: Request, notice?: string, type: 'success' | 'error' = 'success') {
  const url = new URL('/inbox', request.url);
  if (notice) {
    url.searchParams.set('chatNotice', notice);
    url.searchParams.set('chatNoticeType', type);
  }
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const form = await request.formData();
  const requestedContactId = typeof form.get('contactId') === 'string' ? form.get('contactId')?.toString().trim() ?? '' : '';
  const requestedPhone = typeof form.get('phone') === 'string' ? cleanPhone(form.get('phone')?.toString() ?? '') : '';
  const requestedName = typeof form.get('displayName') === 'string' ? form.get('displayName')?.toString().trim().slice(0, 80) ?? '' : '';

  if (!requestedContactId && !requestedPhone) {
    return redirectToInbox(request, 'Indique un número o elija un contacto.', 'error');
  }

  if (requestedPhone && !phonePattern.test(requestedPhone)) {
    return redirectToInbox(request, 'El número ingresado no es válido.', 'error');
  }

  let contact = requestedContactId
    ? await prisma.contact.findUnique({ where: { id: requestedContactId }, select: { id: true, waId: true, phone: true, displayName: true } })
    : null;

  if (!contact && requestedPhone) {
    contact = await prisma.contact.findFirst({
      where: {
        OR: [{ phone: requestedPhone }, { waId: requestedPhone }],
      },
      select: { id: true, waId: true, phone: true, displayName: true },
    });
  }

  if (!contact && requestedContactId) {
    return redirectToInbox(request, 'El contacto seleccionado ya no existe.', 'error');
  }

  const createdContact = !contact && Boolean(requestedPhone);

  if (!contact && requestedPhone) {
    contact = await prisma.contact.create({
      data: {
        phone: requestedPhone,
        waId: requestedPhone,
        displayName: requestedName || requestedPhone,
      },
      select: { id: true, waId: true, phone: true, displayName: true },
    });
  }

  if (!contact) {
    return redirectToInbox(request, 'No se pudo preparar el nuevo chat.', 'error');
  }

  const conversation = await prisma.conversation.upsert({
    where: { contactId: contact.id },
    update: {},
    create: {
      contactId: contact.id,
      status: 'UNASSIGNED',
    },
    select: { id: true, contactId: true },
  });

  await writeAuditLog({
    userId: session.userId,
    action: AUDIT_ACTIONS.INBOX_CHAT_OPENED,
    entityType: 'conversation',
    entityId: conversation.id,
    metadata: {
      contactId: contact.id,
      phone: contact.phone,
      waId: contact.waId,
      source: requestedContactId ? 'contact' : 'phone',
      createdContact,
    },
  });

  return NextResponse.redirect(safeRedirect(request, `/inbox?conversation=${conversation.id}`), { status: 303 });
}
