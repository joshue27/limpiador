import { NextResponse } from 'next/server';

import { auditDeniedAccess, getVerifiedSession } from '@/modules/auth/guards';
import { AUDIT_ACTIONS } from '@/modules/audit/actions';
import { writeAuditLog } from '@/modules/audit/audit';
import { deleteControlledTagSafely } from '@/modules/tags/controlled-tags';

export const runtime = 'nodejs';

function redirectToSettings(request: Request, notice?: string, type: 'success' | 'error' = 'success') {
  const url = new URL('/settings', request.url);
  if (notice) {
    url.searchParams.set('tagNotice', notice);
    url.searchParams.set('tagNoticeType', type);
  }

  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getVerifiedSession();
  if (!session) {
    await auditDeniedAccess({ request, session, entityType: 'controlled_tag', entityId: id, reason: 'unauthenticated' });
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  if (session.role !== 'ADMIN') {
    await auditDeniedAccess({ request, session, entityType: 'controlled_tag', entityId: id, reason: 'forbidden_role' });
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const result = await deleteControlledTagSafely(id);
  if (result.status === 'not_found') {
    return redirectToSettings(request, 'Etiqueta no encontrada.', 'error');
  }

  if (result.status === 'in_use') {
    await writeAuditLog({
      userId: session.userId,
      action: AUDIT_ACTIONS.TAG_DELETE_REJECTED,
      entityType: 'controlled_tag',
      entityId: result.tag.id,
      metadata: { code: result.tag.code, name: result.tag.name, usageCount: result.usageCount },
    });

    return redirectToSettings(request, `No se puede eliminar. La etiqueta está en ${result.usageCount} contacto(s).`, 'error');
  }

  await writeAuditLog({
    userId: session.userId,
    action: AUDIT_ACTIONS.TAG_DELETED,
    entityType: 'controlled_tag',
    entityId: result.tag.id,
    metadata: { code: result.tag.code, name: result.tag.name },
  });

  return redirectToSettings(request, 'Etiqueta eliminada.');
}
