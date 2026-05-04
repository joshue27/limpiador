import { describe, expect, it, vi, beforeEach } from 'vitest';

import { getConversationComposerState } from '@/modules/inbox/composer';

vi.mock('@/lib/config', () => ({
  getConfig: vi.fn(() => ({ whatsappWindowBypass: false })),
}));

import { getConfig } from '@/lib/config';

describe('getConversationComposerState', () => {
  const now = new Date('2026-04-24T18:00:00.000Z');

  beforeEach(() => {
    vi.mocked(getConfig).mockReturnValue({ whatsappWindowBypass: false } as ReturnType<typeof getConfig>);
  });

  it('habilita texto libre cuando la ventana Meta sigue activa', () => {
    const state = getConversationComposerState(new Date('2026-04-24T10:30:00.000Z'), now);

    expect(state.mode).toBe('free_text');
    expect(state.canSendFreeText).toBe(true);
    expect(state.notice).toBe('Podés responder con texto libre mientras la ventana de 24 horas siga activa.');
  });

  it('bloquea texto libre si nunca hubo actividad entrante', () => {
    const state = getConversationComposerState(null, now);

    expect(state.mode).toBe('template_only');
    expect(state.canSendFreeText).toBe(false);
    expect(state.notice).toBe('Todavía no podés enviar texto libre: no hay actividad entrante registrada.');
  });

  it('bloquea texto libre cuando la ventana ya cerró', () => {
    const state = getConversationComposerState(new Date('2026-04-23T17:59:00.000Z'), now);

    expect(state.mode).toBe('template_only');
    expect(state.canSendFreeText).toBe(false);
    expect(state.notice).toBe('La ventana de 24 horas está cerrada. Prepará una plantilla para retomar la conversación.');
  });

  it('fuerza texto libre cuando WHATSAPP_WINDOW_BYPASS está activo (dev)', () => {
    vi.mocked(getConfig).mockReturnValue({ whatsappWindowBypass: true } as ReturnType<typeof getConfig>);

    // Even with null lastInboundAt, bypass should unlock
    const stateNull = getConversationComposerState(null, now);
    expect(stateNull.mode).toBe('free_text');
    expect(stateNull.canSendFreeText).toBe(true);
    expect(stateNull.notice).toContain('WHATSAPP_WINDOW_BYPASS');

    // Even with expired window, bypass should unlock
    const stateExpired = getConversationComposerState(new Date('2026-04-23T17:59:00.000Z'), now);
    expect(stateExpired.mode).toBe('free_text');
    expect(stateExpired.canSendFreeText).toBe(true);
    expect(stateExpired.notice).toContain('WHATSAPP_WINDOW_BYPASS');
  });
});
