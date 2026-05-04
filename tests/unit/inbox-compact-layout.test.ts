import { describe, expect, it } from 'vitest';

import {
  getConversationActionMenuModel,
  getInboxComposerLayoutModel,
  getInboxSummaryBarModel,
} from '@/modules/inbox/compact-layout';

describe('getInboxSummaryBarModel', () => {
  it('compacta el header superior en una sola barra sin subtítulo redundante', () => {
    const summary = getInboxSummaryBarModel({
      total: 18,
      unread: 4,
      queue: 3,
      claimed: 11,
    });

    expect(summary.title).toBe('Atención · Inbox');
    expect(summary.subtitle).toBeNull();
    expect(summary.metrics).toEqual([
      { label: 'Total', value: 18 },
      { label: 'No leídos', value: 4 },
      { label: 'En cola', value: 3 },
      { label: 'Asignadas', value: 11 },
    ]);
  });
});

describe('getInboxComposerLayoutModel', () => {
  it('evita repetir notices largos cuando el chat sigue habilitado para texto libre', () => {
    const layout = getInboxComposerLayoutModel({
      composerState: {
        mode: 'free_text',
        canSendFreeText: true,
        notice: 'Podés responder con texto libre mientras la ventana siga activa.',
        placeholder: 'Escribí una respuesta breve…',
      },
      hasTemplates: true,
    });

    expect(layout.statusLabel).toBe('Libre');
    expect(layout.showNotice).toBe(false);
    expect(layout.showTemplateSelect).toBe(false);
    expect(layout.fieldTag).toBe('input');
    expect(layout.submitLabel).toBe('Enviar');
    expect(layout.helperText).toBeNull();
  });

  it('usa selector compacto de plantilla cuando el chat quedó en template_only', () => {
    const layout = getInboxComposerLayoutModel({
      composerState: {
        mode: 'template_only',
        canSendFreeText: false,
        notice: 'La ventana está cerrada.',
        placeholder: 'La respuesta libre está bloqueada.',
      },
      hasTemplates: true,
    });

    expect(layout.statusLabel).toBe('Plantilla');
    expect(layout.showNotice).toBe(false);
    expect(layout.showTemplateSelect).toBe(true);
    expect(layout.fieldTag).toBe('select');
    expect(layout.submitLabel).toBe('Abrir');
    expect(layout.helperText).toBeNull();
  });

  it('mantiene el flujo template_only pero marca falta de plantillas sin agregar copy redundante', () => {
    const layout = getInboxComposerLayoutModel({
      composerState: {
        mode: 'template_only',
        canSendFreeText: false,
        notice: 'La ventana está cerrada.',
        placeholder: 'La respuesta libre está bloqueada.',
      },
      hasTemplates: false,
    });

    expect(layout.showTemplateSelect).toBe(true);
    expect(layout.submitLabel).toBe('Abrir');
    expect(layout.submitDisabled).toBe(true);
    expect(layout.helperText).toBe('Sin plantillas');
  });
});

describe('getConversationActionMenuModel', () => {
  it('deja la acción principal visible y mueve las auxiliares al menú compacto', () => {
    const actions = getConversationActionMenuModel({ canClaim: true, canTransfer: true });

    expect(actions.primaryActionLabel).toBe('Atender');
    expect(actions.showOverflowMenu).toBe(true);
    expect(actions.overflowItems).toEqual(['Transferir']);
  });

  it('oculta el menú si no existen acciones secundarias', () => {
    const actions = getConversationActionMenuModel({ canClaim: false, canTransfer: false });

    expect(actions.primaryActionLabel).toBeNull();
    expect(actions.showOverflowMenu).toBe(false);
    expect(actions.overflowItems).toEqual([]);
  });
});
