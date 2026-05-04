import { NextResponse } from 'next/server';

import { auditDeniedAccess, getVerifiedSession } from '@/modules/auth/guards';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import { createControlledTag } from '@/modules/tags/controlled-tags';

export const runtime = 'nodejs';

function redirectToSettings(request: Request, notice?: string, type: 'success' | 'error' = 'success') {
  const url = new URL('/settings', request.url);
  if (notice) {
    url.searchParams.set('tagNotice', notice);
    url.searchParams.set('tagNoticeType', type);
  }

  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session) {
    await auditDeniedAccess({ request, session, entityType: 'controlled_tag', reason: 'unauthenticated' });
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  if (session.role !== 'ADMIN') {
    await auditDeniedAccess({ request, session, entityType: 'controlled_tag', reason: 'forbidden_role' });
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const form = await request.formData();
  const name = form.get('name');
  if (typeof name !== 'string') return NextResponse.json({ error: 'Nombre inválido.' }, { status: 400 });

  try {
    const tag = await createControlledTag(name);
    await writeAuditLog({
      userId: session.userId,
      action: AUDIT_ACTIONS.TAG_CREATED,
      entityType: 'controlled_tag',
      entityId: tag.id,
      metadata: { code: tag.code, name: tag.name },
    });
  } catch {
    return redirectToSettings(request, 'No se pudo crear la etiqueta.', 'error');
  }

  return redirectToSettings(request, 'Etiqueta creada.');
}
