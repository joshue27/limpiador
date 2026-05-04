import type { ConversationComposerState } from '@/modules/inbox/composer';

type InboxSummaryBarInput = {
  total: number;
  unread: number;
  queue: number;
  claimed: number;
};

type InboxComposerLayoutInput = {
  composerState: ConversationComposerState;
  hasTemplates: boolean;
};

type ConversationActionMenuInput = {
  canClaim: boolean;
  canTransfer: boolean;
};

export function getInboxSummaryBarModel(input: InboxSummaryBarInput) {
  return {
    title: 'Atención · Inbox',
    subtitle: null,
    metrics: [
      { label: 'Total', value: input.total },
      { label: 'No leídos', value: input.unread },
      { label: 'En cola', value: input.queue },
      { label: 'Asignadas', value: input.claimed },
    ],
  };
}

export function getInboxComposerLayoutModel(input: InboxComposerLayoutInput) {
  if (input.composerState.mode === 'free_text') {
    return {
      statusLabel: 'Libre',
      showNotice: false,
      showTemplateSelect: false,
      fieldTag: 'input' as const,
      submitLabel: 'Enviar',
      submitDisabled: !input.composerState.canSendFreeText,
      helperText: null,
    };
  }

  return {
    statusLabel: 'Plantilla',
    showNotice: false,
    showTemplateSelect: true,
    fieldTag: 'select' as const,
    submitLabel: 'Abrir',
    submitDisabled: !input.hasTemplates,
    helperText: input.hasTemplates ? null : 'Sin plantillas',
  };
}

export function getConversationActionMenuModel(input: ConversationActionMenuInput) {
  const overflowItems = [input.canTransfer ? 'Transferir' : null].filter((item): item is string => item !== null);

  return {
    primaryActionLabel: input.canClaim ? 'Atender' : null,
    showOverflowMenu: overflowItems.length > 0,
    overflowItems,
  };
}
