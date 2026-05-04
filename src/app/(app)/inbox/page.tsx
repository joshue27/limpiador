import Link from 'next/link';
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/modules/auth/guards';
import { canClaimConversation, canTransferConversation, canViewConversation, conversationListWhereForSession } from '@/modules/inbox/access';
import { buildConversationSearchResult, splitTextSearchMatches, type ConversationSearchMatch } from '@/modules/inbox/chat-search';
import { InboxAutoRefresh } from '@/modules/inbox/InboxAutoRefresh';
import { ChatSearchForm } from '@/modules/inbox/ChatSearchForm';
import { DeleteConversationButton } from '@/modules/inbox/DeleteConversationButton';
import { ConversationChatClient } from '@/modules/inbox/ConversationChatClient';
import { TagManager } from '@/modules/inbox/TagManager';
import { getConversationActionMenuModel, getInboxComposerLayoutModel, getInboxSummaryBarModel } from '@/modules/inbox/compact-layout';
import { getConversationComposerState, getConversationOpeningTemplateOptions } from '@/modules/inbox/composer';
import { encodeInboxCursor } from '@/modules/inbox/cursor';
import { conversationStatusOptions, inboxLink, parseInboxFilters } from '@/modules/inbox/list-filters';
import { listControlledTags } from '@/modules/tags/controlled-tags';

const conversationStatusLabels: Record<string, string> = {
  UNASSIGNED: 'Sin asignar',
  MENU_PENDING: 'Esperando menú',
  DEPARTMENT_QUEUE: 'En cola de equipo',
  CLAIMED: 'En atención',
};

const messageDirectionLabels: Record<string, string> = {
  INBOUND: 'Cliente',
  OUTBOUND: 'Operador',
};

const messageTypeLabels: Record<string, string> = {
  TEXT: 'Texto',
  IMAGE: 'Imagen',
  AUDIO: 'Audio',
  VIDEO: 'Video',
  DOCUMENT: 'Documento',
  STICKER: 'Sticker',
  TEMPLATE: 'Plantilla',
  UNKNOWN: 'Desconocido',
};

const messageStatusLabels: Record<string, string> = {
  PENDING: 'Pendiente',
  RECEIVED: 'Recibido',
  SENT: 'Enviado',
  DELIVERED: 'Entregado',
  READ: 'Leído',
  FAILED: 'Con error',
};

const whatsappWindowMs = 24 * 60 * 60 * 1000;

function labelFor(labels: Record<string, string>, value: string) {
  return labels[value] ?? value;
}

function formatShortDate(date: Date | null) {
  if (!date) return 'Sin fecha';
  return new Intl.DateTimeFormat('es', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Guatemala',
  }).format(date);
}

function previewMessage(message?: { body: string | null; caption: string | null; type: string }) {
  if (!message) return 'Sin mensajes todavía';
  return message.body ?? message.caption ?? `Adjunto: ${labelFor(messageTypeLabels, message.type)}`;
}

function attachmentFallbackLabel(messageType: string) {
  return messageType === 'DOCUMENT' ? 'Documento adjunto' : 'Mensaje con adjunto';
}

function compactTags(tags: string[]) {
  return tags.slice(0, 3);
}

function tagLabel(tags: Map<string, string>, code: string) {
  return tags.get(code) ?? code;
}

function assignmentLabel(conversation: { assignedDepartment: { name: string } | null; assignedTo: { email: string } | null }) {
  if (conversation.assignedTo) return conversation.assignedTo.email;
  if (conversation.assignedDepartment) return conversation.assignedDepartment.name;
  return 'Bandeja general';
}

function formatWindowRemaining(ms: number) {
  const totalMinutes = Math.max(1, Math.ceil(ms / (60 * 1000)));

  if (totalMinutes < 60) return `${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
}

function whatsappWindowState(lastInboundAt: Date | null, now = new Date()) {
  if (!lastInboundAt) {
    return {
      label: 'Sin actividad entrante',
      detail: 'No hay mensajes entrantes registrados',
      className: 'muted',
    };
  }

  const closesAt = new Date(lastInboundAt.getTime() + whatsappWindowMs);
  const remainingMs = closesAt.getTime() - now.getTime();

  if (remainingMs <= 0) {
    return {
      label: 'Conversación cerrada',
      detail: `Venció el ${formatShortDate(closesAt)}`,
      className: 'status-window-closed',
    };
  }

  return {
    label: 'Ventana activa',
    detail: `Cierra en ${formatWindowRemaining(remainingMs)}`,
    className: 'status-window-active',
  };
}

function matchesForField(matches: ConversationSearchMatch[], messageId: string, field: ConversationSearchMatch['field'], assetId?: string) {
  return matches.filter((match) => (
    match.messageId === messageId
    && match.field === field
    && (field !== 'filename' || match.assetId === assetId)
  ));
}

function renderHighlightedText(text: string, matches: ConversationSearchMatch[], activeMatchIndex: number) {
  return splitTextSearchMatches(text, matches, activeMatchIndex).map((part) => {
    if (!part.highlighted) return part.text;

    return (
      <mark
        key={`${part.index}-${part.text}-${part.active ? 'active' : 'match'}`}
        className={part.active ? 'search-highlight search-highlight-active' : 'search-highlight'}
      >
        {part.text}
      </mark>
    );
  });
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams?: Promise<{
    conversation?: string;
    q?: string;
    status?: string;
    tag?: string;
    assignedUser?: string;
    department?: string;
    chatNotice?: string;
    chatNoticeType?: 'success' | 'error';
    chatSearch?: string;
    chatMatch?: string;
  }>;
}) {
  const session = await requirePermission('inbox');
  const params = await searchParams;
  const now = new Date();
  const parsedFilters = parseInboxFilters(params ?? {});
  const activeTags = await listControlledTags();
  const activeTagNames = new Map(activeTags.map((item) => [item.code, item.name]));
  const activeTagCodes = new Set(activeTags.map((tag) => tag.code));
  const filters = {
    ...parsedFilters,
    tag: activeTagCodes.has(parsedFilters.tag) ? parsedFilters.tag : '',
  };
  const accessWhere = await conversationListWhereForSession(session);
  const visibleUsersPromise = session.role === 'ADMIN'
    ? prisma.user.findMany({ where: { status: 'ACTIVE' }, orderBy: { email: 'asc' }, select: { id: true, email: true } })
    : prisma.user.findMany({ where: { id: session.userId, status: 'ACTIVE' }, orderBy: { email: 'asc' }, select: { id: true, email: true } });
  const visibleDepartmentsPromise = session.role === 'ADMIN'
    ? prisma.department.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } })
    : prisma.department.findMany({
        where: { active: true, users: { some: { userId: session.userId } } },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true },
      });
  const quickContactsPromise = prisma.contact.findMany({
    orderBy: [{ updatedAt: 'desc' }, { displayName: 'asc' }],
    take: 80,
    select: { id: true, displayName: true, phone: true, waId: true },
  });
  const [visibleUsers, visibleDepartments, quickContacts] = await Promise.all([visibleUsersPromise, visibleDepartmentsPromise, quickContactsPromise]);
  const visibleUserIds = new Set(visibleUsers.map((user) => user.id));
  const visibleDepartmentIds = new Set(visibleDepartments.map((department) => department.id));
  const filterWhere: Prisma.ConversationWhereInput[] = [];
  if (filters.status) filterWhere.push({ status: filters.status as Prisma.EnumConversationStatusFilter['equals'] });
  if (filters.tag) filterWhere.push({ contact: { tags: { has: filters.tag } } });
  if (filters.assignedUser && visibleUserIds.has(filters.assignedUser)) {
    filterWhere.push({ assignedToId: filters.assignedUser });
  }
  if (filters.department && visibleDepartmentIds.has(filters.department)) {
    filterWhere.push({ assignedDepartmentId: filters.department });
  }
  if (filters.q) {
    filterWhere.push({
      OR: [
        { contact: { displayName: { contains: filters.q, mode: 'insensitive' } } },
        { contact: { phone: { contains: filters.q, mode: 'insensitive' } } },
        { contact: { waId: { contains: filters.q, mode: 'insensitive' } } },
        { messages: { some: { OR: [{ body: { contains: filters.q, mode: 'insensitive' } }, { caption: { contains: filters.q, mode: 'insensitive' } }] } } },
      ],
    });
  }
  const where: Prisma.ConversationWhereInput = filterWhere.length ? { AND: [accessWhere, ...filterWhere] } : accessWhere;
  const conversations = await prisma.conversation.findMany({
    where,
    include: { contact: true, assignedDepartment: true, assignedTo: true, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
    take: 40,
  });
  const requestedId = params?.conversation;
  const selectedId = requestedId && (await canViewConversation(session, requestedId)) ? requestedId : conversations[0]?.id;
    const selected = selectedId
      ? await prisma.conversation.update({
          where: { id: selectedId },
          data: { unreadCount: 0 },
          include: { assignedDepartment: true, assignedTo: true, contact: true, messages: { where: { hiddenGlobally: false, hiddenByUsers: { none: { userId: session.userId } } }, include: { mediaAssets: true }, orderBy: { createdAt: 'desc' }, take: 21 } },
        })
      : null;
  const rawMessages = selected?.messages ?? [];
  const MESSAGE_WINDOW_SIZE = 20;
  const hasMoreOlder = rawMessages.length > MESSAGE_WINDOW_SIZE;
  const newestMessages = rawMessages.slice(0, MESSAGE_WINDOW_SIZE);
  const visibleMessages = [...newestMessages].reverse();
  const oldestCursor = visibleMessages.length > 0
    ? encodeInboxCursor(visibleMessages[0].createdAt, visibleMessages[0].id)
    : '';
  const canClaimSelected = selected ? await canClaimConversation(session, selected.id) : false;
  const canTransferSelected = selected ? await canTransferConversation(session, selected.id) : false;
  const departments = selected && canTransferSelected ? await prisma.department.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }) : [];
  const users = selected && canTransferSelected
    ? await prisma.user.findMany({ where: { status: 'ACTIVE' }, orderBy: { email: 'asc' }, select: { id: true, email: true } })
    : [];
  const openingTemplateSeeds = selected
    ? await prisma.campaign.findMany({
        select: { templateName: true, templateLanguage: true },
        distinct: ['templateName', 'templateLanguage'],
        orderBy: [{ templateName: 'asc' }, { templateLanguage: 'asc' }],
      })
    : [];
  const openingTemplates = getConversationOpeningTemplateOptions(openingTemplateSeeds);
  const totalUnread = conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);
  const queueCount = conversations.filter((conversation) => conversation.status === 'DEPARTMENT_QUEUE' && !conversation.assignedToId).length;
  const claimedCount = conversations.filter((conversation) => conversation.status === 'CLAIMED' || conversation.assignedToId).length;
  const summaryBar = getInboxSummaryBarModel({ total: conversations.length, unread: totalUnread, queue: queueCount, claimed: claimedCount });
  const chatNotice = typeof params?.chatNotice === 'string' ? params.chatNotice : null;
  const chatNoticeType = params?.chatNoticeType === 'error' ? 'error' : 'success';
  const requestedChatMatch = Number.parseInt(typeof params?.chatMatch === 'string' ? params.chatMatch : '0', 10);
  // Full-conversation search: when chatSearch is present, query ALL visible messages
  // for the selected conversation so search totals reflect the full conversation,
  // not just the 20-message display window.
  const hasChatSearch = typeof params?.chatSearch === 'string' && params.chatSearch.trim().length > 0;
  const fullConversationSearchMessages = hasChatSearch && selected
    ? await prisma.message.findMany({
        where: {
          conversationId: selected.id,
          hiddenGlobally: false,
          hiddenByUsers: { none: { userId: session.userId } },
        },
        select: {
          id: true,
          body: true,
          caption: true,
          mediaAssets: { select: { id: true, filename: true, mimeType: true, size: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
    : null;
  const chatSearch = selected
    ? buildConversationSearchResult(
        fullConversationSearchMessages ?? visibleMessages,
        params?.chatSearch,
        Number.isNaN(requestedChatMatch) ? 0 : requestedChatMatch,
      )
    : null;
  const activeFilterCount = [filters.q, filters.status, filters.assignedUser, filters.department, filters.tag].filter(Boolean).length;
  const activeFilterLabels = [
    filters.q ? `Buscar: ${filters.q}` : null,
    filters.status ? `Estado: ${conversationStatusLabels[filters.status] ?? filters.status}` : null,
    filters.assignedUser ? `Usuario: ${visibleUsers.find((user) => user.id === filters.assignedUser)?.email ?? 'Aplicado'}` : null,
    filters.department ? `Depto: ${visibleDepartments.find((department) => department.id === filters.department)?.name ?? 'Aplicado'}` : null,
    filters.tag ? `Etiqueta: ${activeTags.find((item) => item.code === filters.tag)?.name ?? filters.tag}` : null,
  ].filter(Boolean);

  return (
    <div className="stack inbox-page">
      <InboxAutoRefresh />
      <section className="inbox-summary-inline" aria-label="Resumen de inbox">
        <strong className="inbox-summary-bar-title">{summaryBar.title}</strong>
        <dl className="compact-metrics" aria-label="Resumen de conversaciones">
          {summaryBar.metrics.map((metric) => <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}
        </dl>
      </section>
      <section className="inbox-layout">
        <aside className="card conversation-list" aria-label="Bandeja de conversaciones">
          <div className="pane-title">
            <div>
              <strong>Bandeja</strong>
              <small>{conversations.length} conversaciones visibles</small>
            </div>
            <details className="new-chat-panel">
              <summary>
                <span className="new-chat-summary-title">＋ Nuevo chat</span>
                <small>rápido</small>
              </summary>
              <form action="/api/inbox/new" method="post" className="new-chat-form">
                <p className="new-chat-hint">Ingrese un número o elija un contacto.</p>
                <label>
                  <span className="sr-only">Número</span>
                  <input name="phone" placeholder="Ej.: +50255555555" inputMode="tel" />
                </label>
                <label>
                  <span className="sr-only">Contacto existente</span>
                  <select name="contactId" defaultValue="">
                    <option value="">Contacto existente</option>
                    {quickContacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {(contact.displayName ?? contact.phone)} · {contact.waId}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="sr-only">Nombre visible</span>
                  <input name="displayName" placeholder="Nombre visible opcional" />
                </label>
                <div className="new-chat-actions">
                  <button type="submit">Abrir chat</button>
                </div>
              </form>
            </details>
          </div>
          {chatNotice ? <p className={chatNoticeType === 'error' ? 'notice notice-error inbox-inline-notice' : 'notice inbox-inline-notice'}>{chatNotice}</p> : null}
          <details className="inbox-filters-panel" open={activeFilterCount > 0}>
            <summary>
              <span>Filtros</span>
              <span className="filter-summary-pills">
                {activeFilterCount > 0 ? activeFilterLabels.map((label) => <span key={label} className="filter-pill">{label}</span>) : <span className="filter-pill muted">Sin filtros</span>}
              </span>
            </summary>
            <form action="/inbox" method="get" className="inbox-filters" aria-label="Filtros de bandeja">
              <label>
                Buscar
                <input name="q" defaultValue={filters.q} placeholder="Nombre, teléfono o texto" />
              </label>
              <label>
                Estado
                <select name="status" defaultValue={filters.status}>
                  <option value="">Todos</option>
                  {conversationStatusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>
                Usuario
                <select name="assignedUser" defaultValue={filters.assignedUser}>
                  <option value="">Todos</option>
                  {visibleUsers.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}
                </select>
              </label>
              <label>
                Departamento
                <select name="department" defaultValue={filters.department}>
                  <option value="">Todos</option>
                  {visibleDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                </select>
              </label>
              <label>
                Etiqueta
                <select name="tag" defaultValue={filters.tag}>
                  <option value="">Todas</option>
                  {activeTags.map((item) => <option key={item.id} value={item.code}>{item.name}</option>)}
                </select>
              </label>
              <div className="inbox-filter-actions">
                <button type="submit">Aplicar filtros</button>
                <a href="/inbox" className="button-link-secondary">Limpiar</a>
              </div>
            </form>
          </details>
          {conversations.length === 0 ? <p className="empty-state">No hay conversaciones para el usuario actual. Cuando ingrese un mensaje, aparecerá en esta bandeja.</p> : null}
          {conversations.map((conversation) => {
            const windowState = whatsappWindowState(conversation.contact.lastInboundAt, now);

            return (
              <Link key={conversation.id} href={inboxLink(conversation.id, filters)} className={`conversation-item ${conversation.id === selected?.id ? 'selected' : ''}`} scroll={false} prefetch={false}>
                <span className="conversation-row-top">
                  <strong>{conversation.contact.displayName ?? conversation.contact.phone}</strong>
                  <small>{formatShortDate(conversation.lastMessageAt ?? conversation.updatedAt)}</small>
                </span>
                <span className="conversation-preview">{previewMessage(conversation.messages[0])}</span>
                <span className="conversation-meta">
                  <span className={`status-pill status-${conversation.status.toLowerCase().replaceAll('_', '-')}`}>{labelFor(conversationStatusLabels, conversation.status)}</span>
                  {compactTags(conversation.contact.tags).map((contactTag) => <span key={contactTag} className="tag-chip">{tagLabel(activeTagNames, contactTag)}</span>)}
                  <span className={`status-pill ${windowState.className}`}>{windowState.label}</span>
                  <small>{windowState.detail}</small>
                  <small>{assignmentLabel(conversation)}</small>
                  {conversation.unreadCount ? <em>{conversation.unreadCount}</em> : null}
                </span>
              </Link>
            );
          })}
        </aside>
        <article className="card message-panel">
           {selected ? (
             (() => {
               const selectedWindowState = whatsappWindowState(selected.contact.lastInboundAt, now);
               const composerState = getConversationComposerState(selected.contact.lastInboundAt, now);
               const composerLayout = getInboxComposerLayoutModel({ composerState, hasTemplates: openingTemplates.length > 0 });
               const actionMenu = getConversationActionMenuModel({ canClaim: canClaimSelected, canTransfer: canTransferSelected });
               const selectableTags = activeTags.filter((tagItem) => !selected.contact.tags.includes(tagItem.code));
               return <>
               <header className="conversation-header">
                 <div className="conversation-primary">
                   <div className="conversation-primary-heading">
                     <p className="eyebrow">Conversación</p>
                     <h3>{selected.contact.displayName ?? selected.contact.phone}</h3>
                   </div>
                    <p className="conversation-waid">WA: {selected.contact.waId}</p>
                    <TagManager
                      conversationId={selected.id}
                      currentTags={selected.contact.tags}
                      activeTags={activeTags}
                    />
                 </div>
                 <div className="conversation-facts">
                   <span className={`status-pill status-${selected.status.toLowerCase().replaceAll('_', '-')}`}>{labelFor(conversationStatusLabels, selected.status)}</span>
                   <span className={`status-pill ${selectedWindowState.className}`}>{selectedWindowState.label}</span>
                   <small>{selectedWindowState.detail}</small>
                   <span className="conversation-fact-chip">{assignmentLabel(selected)}</span>
                   <span className="conversation-fact-chip">{selected.unreadCount} sin leer</span>
                 </div>
               </header>
               <section className="conversation-actions conversation-actions-compact" aria-label="Acciones de conversación">
                 <div className="actions-grid">
                   {canClaimSelected ? (
                     <form action={`/api/inbox/${selected.id}/claim`} method="post" className="claim-form">
                       <button type="submit" className="compact-action-button">{actionMenu.primaryActionLabel}</button>
                     </form>
                   ) : null}
                   {session.role === 'ADMIN' && (
                     <>
                       <form action={`/api/inbox/${selected.id}/delete`} method="post" className="delete-form" id={`delete-form-${selected.id}`}>
                         <input type="hidden" name="confirmation" value="ELIMINAR" />
                       </form>
                       <DeleteConversationButton conversationId={selected.id} />
                     </>
                   )}
                     <small className="conversation-inline-count" id="message-count">{visibleMessages.length} mensajes</small>
                  </div>
                 <ChatSearchForm
                   conversationId={selected.id}
                   filters={{
                     q: filters.q,
                     status: filters.status,
                     assignedUser: filters.assignedUser,
                     department: filters.department,
                     tag: filters.tag,
                   }}
                   chatQuery={chatSearch?.query ?? ''}
                   total={chatSearch?.total ?? 0}
                   activeMatchIndex={chatSearch?.activeMatchIndex ?? -1}
                   hasMatches={(chatSearch?.matches?.length ?? 0) > 0}
                 />
                 {actionMenu.showOverflowMenu ? (
                   <details className="conversation-overflow-menu">
                     <summary aria-label="Más acciones">⋯</summary>
                     <div className="conversation-overflow-popover">
                       {canTransferSelected ? (
                         <form action={`/api/inbox/${selected.id}/transfer`} method="post" className="transfer-form overflow-transfer-form">
                           <label>
                             <span className="sr-only">Departamento</span>
                             <select name="toDepartmentId" defaultValue="">
                               <option value="">Depto.</option>
                               {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                             </select>
                           </label>
                           <label>
                             <span className="sr-only">Usuario</span>
                             <select name="toUserId" defaultValue="">
                               <option value="">Usuario</option>
                               {users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}
                             </select>
                           </label>
                           <input name="reason" placeholder="Motivo" />
                           <button type="submit" className="compact-action-button">{actionMenu.overflowItems[0]}</button>
                         </form>
                       ) : null}
                     </div>
                   </details>
                 ) : null}
               </section>
                 <ConversationChatClient
                   conversationId={selected.id}
                   messages={visibleMessages}
                   currentUserId={session.userId}
                   isBlurred={session.role !== 'ADMIN' && selected.assignedToId !== session.userId && (selected.status === 'DEPARTMENT_QUEUE' || selected.status === 'CLAIMED')}
                   canClaim={canClaimSelected}
                   claimAction={`/api/inbox/${selected.id}/claim`}
                   canSendFreeText={composerState.canSendFreeText}
                   bodyPlaceholder={composerState.placeholder}
                   fieldTag={composerLayout.fieldTag}
                   submitDisabled={composerLayout.submitDisabled}
                   submitLabel={composerLayout.submitLabel}
                   openingTemplates={openingTemplates}
                   oldestCursor={oldestCursor}
                   hasMoreOlder={hasMoreOlder}
                   chatSearchMatches={chatSearch?.matches ?? []}
                   chatSearchActiveIndex={chatSearch?.activeMatchIndex ?? -1}
                 />
             </>;
             })()
           ) : (
            <div className="empty-state inbox-empty">
              <strong>Seleccione una conversación para empezar</strong>
              <p>Desde la bandeja izquierda puede ver el estado, la asignación y los mensajes sin leer. Al elegir una conversación, aquí aparecerán el historial y las acciones disponibles.</p>
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
