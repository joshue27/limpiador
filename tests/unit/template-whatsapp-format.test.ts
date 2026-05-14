import { describe, expect, it } from 'vitest';

import {
  parseWhatsAppInline,
  parseWhatsAppText,
  wrapWhatsAppSelection,
} from '@/modules/templates/whatsapp-format';

describe('parseWhatsAppInline', () => {
  it('detecta negrita, cursiva, tachado y monoespacio', () => {
    expect(parseWhatsAppInline('Hola *mundo* _itálica_ ~tachado~ ```código```')).toEqual([
      { type: 'text', value: 'Hola ' },
      { type: 'bold', value: 'mundo' },
      { type: 'text', value: ' ' },
      { type: 'italic', value: 'itálica' },
      { type: 'text', value: ' ' },
      { type: 'strike', value: 'tachado' },
      { type: 'text', value: ' ' },
      { type: 'code', value: 'código' },
    ]);
  });

  it('deja intactos los delimitadores sin cierre', () => {
    expect(parseWhatsAppInline('Texto con *asterisco suelto')).toEqual([
      { type: 'text', value: 'Texto con ' },
      { type: 'text', value: '*asterisco suelto' },
    ]);
  });
});

describe('parseWhatsAppText', () => {
  it('separa párrafos y conserva saltos de línea internos', () => {
    expect(parseWhatsAppText('Primera línea\nSegunda línea\n\n*Título*\nDetalle')).toEqual([
      {
        lines: [
          [{ type: 'text', value: 'Primera línea' }],
          [{ type: 'text', value: 'Segunda línea' }],
        ],
      },
      {
        lines: [[{ type: 'bold', value: 'Título' }], [{ type: 'text', value: 'Detalle' }]],
      },
    ]);
  });
});

describe('wrapWhatsAppSelection', () => {
  it('envuelve cada línea no vacía cuando la selección tiene saltos', () => {
    expect(wrapWhatsAppSelection('uno\ndos\n\ntres', '*')).toBe('*uno*\n*dos*\n\n*tres*');
  });
});
