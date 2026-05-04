import { describe, expect, it } from 'vitest';

import { getComposerAttachmentPills } from '@/modules/inbox/composer-attachment-pill';

describe('getComposerAttachmentPills', () => {
  it('no muestra pills cuando todavía no hay archivos seleccionados', () => {
    expect(getComposerAttachmentPills([])).toEqual([]);
  });

  it('muestra una pill compacta por cada archivo seleccionado en orden', () => {
    expect(getComposerAttachmentPills([
      { name: '  comprobante abril.pdf  ' },
      { name: ' foto frente.png ' },
    ])).toEqual([
      {
        filename: 'comprobante abril.pdf',
        removeLabel: 'Quitar adjunto',
      },
      {
        filename: 'foto frente.png',
        removeLabel: 'Quitar adjunto',
      },
    ]);
  });

  it('descarta nombres vacíos sin romper el resto de las pills', () => {
    expect(getComposerAttachmentPills([
      { name: '   ' },
      { name: 'evidencia.webp' },
    ])).toEqual([
      {
        filename: 'evidencia.webp',
        removeLabel: 'Quitar adjunto',
      },
    ]);
  });
});
