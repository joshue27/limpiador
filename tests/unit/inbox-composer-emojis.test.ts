import { describe, expect, it } from 'vitest';

import { composerEmojiOptions, insertEmojiIntoComposer } from '@/modules/inbox/composer-emojis';

describe('composerEmojiOptions', () => {
  it('expone una grilla mínima de emojis útiles para respuestas rápidas', () => {
    expect(composerEmojiOptions).toEqual([
      { value: '😊', label: 'Sonrisa' },
      { value: '👍', label: 'Ok' },
      { value: '🙏', label: 'Gracias' },
      { value: '🎉', label: 'Celebrar' },
      { value: '👀', label: 'Revisar' },
      { value: '⚠️', label: 'Atención' },
      { value: '📌', label: 'Recordatorio' },
      { value: '✅', label: 'Resuelto' },
    ]);
  });
});

describe('insertEmojiIntoComposer', () => {
  it('inserta el emoji directo cuando el mensaje todavía está vacío', () => {
    expect(insertEmojiIntoComposer('', '😊')).toBe('😊');
  });

  it('agrega un separador simple cuando ya existe texto libre', () => {
    expect(insertEmojiIntoComposer('Te paso el detalle', '📌')).toBe('Te paso el detalle 📌');
  });

  it('evita duplicar espacios si el texto ya termina con separación', () => {
    expect(insertEmojiIntoComposer('Gracias ', '🙏')).toBe('Gracias 🙏');
  });
});
