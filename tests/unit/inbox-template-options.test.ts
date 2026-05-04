import { describe, expect, it } from 'vitest';

import { getConversationOpeningTemplateOptions, parseConversationTemplateKey } from '@/modules/inbox/composer';

describe('getConversationOpeningTemplateOptions', () => {
  it('deduplica plantillas y las ordena para el selector compacto', () => {
    const options = getConversationOpeningTemplateOptions([
      { templateName: 'seguimiento_pago', templateLanguage: 'es' },
      { templateName: 'reabrir_chat', templateLanguage: 'pt_BR' },
      { templateName: 'seguimiento_pago', templateLanguage: 'es' },
      { templateName: 'reabrir_chat', templateLanguage: 'es' },
    ]);

    expect(options).toEqual([
      { key: 'reabrir_chat::es', label: 'reabrir_chat · es', name: 'reabrir_chat', languageCode: 'es' },
      { key: 'reabrir_chat::pt_BR', label: 'reabrir_chat · pt_BR', name: 'reabrir_chat', languageCode: 'pt_BR' },
      { key: 'seguimiento_pago::es', label: 'seguimiento_pago · es', name: 'seguimiento_pago', languageCode: 'es' },
    ]);
  });
});

describe('parseConversationTemplateKey', () => {
  it('parsea la opción elegida para reusar la infraestructura de Meta', () => {
    expect(parseConversationTemplateKey('reabrir_chat::es')).toEqual({ name: 'reabrir_chat', languageCode: 'es' });
  });

  it('rechaza valores incompletos', () => {
    expect(parseConversationTemplateKey('reabrir_chat')).toBeNull();
  });
});
