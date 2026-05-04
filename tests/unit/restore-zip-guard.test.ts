import { describe, expect, it } from 'vitest';

import { validateRestoreZipEntryPlan } from '@/modules/restore/restore-zip-guard';

describe('restore ZIP guard', () => {
  it('rejects archives with too many restore entries before database writes', () => {
    const entries = Array.from({ length: 3 }, (_, index) => ({
      name: `chat-${index}.txt`,
      size: 10,
    }));

    expect(
      validateRestoreZipEntryPlan(entries, {
        maxEntries: 2,
        maxTotalBytes: 100,
        maxEntryBytes: 100,
      }),
    ).toEqual({
      ok: false,
      status: 413,
      error: 'El ZIP contiene demasiados archivos.',
    });
  });

  it('rejects oversized per-entry and total decompressed restore payloads', () => {
    expect(
      validateRestoreZipEntryPlan([{ name: 'chat.txt', size: 101 }], {
        maxEntries: 5,
        maxTotalBytes: 1_000,
        maxEntryBytes: 100,
      }),
    ).toEqual({
      ok: false,
      status: 413,
      error: 'Un archivo del ZIP excede el tamaño máximo permitido.',
    });

    expect(
      validateRestoreZipEntryPlan(
        [
          { name: 'chat-1.txt', size: 70 },
          { name: 'chat-2.txt', size: 70 },
        ],
        { maxEntries: 5, maxTotalBytes: 100, maxEntryBytes: 100 },
      ),
    ).toEqual({
      ok: false,
      status: 413,
      error: 'El contenido descomprimido del ZIP excede el tamaño máximo permitido.',
    });
  });
});
