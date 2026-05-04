import { describe, expect, it } from 'vitest';

import { formatRestoreStatusMessage, isRestoreTerminalStatus, type RestoreRunStatusPayload } from '@/modules/exports/RestoreForm';

describe('restore form status helpers', () => {
  it('formats background restore progress using the async status payload', () => {
    const status: RestoreRunStatusPayload = {
      id: 'restore-1',
      status: 'RUNNING',
      progress: 45,
      counts: null,
      error: null,
      updatedAt: '2026-05-02T00:00:00.000Z',
    };

    expect(formatRestoreStatusMessage(status)).toBe('Restauración en progreso (45%).');
    expect(isRestoreTerminalStatus(status.status)).toBe(false);
  });

  it('formats final restored counts once the background restore completes', () => {
    const status: RestoreRunStatusPayload = {
      id: 'restore-1',
      status: 'READY',
      progress: 100,
      counts: { conversationsRestored: 2, messagesRestored: 5, mediaRestored: 1 },
      error: null,
      updatedAt: '2026-05-02T00:00:00.000Z',
    };

    expect(formatRestoreStatusMessage(status)).toBe('2 conversaciones, 5 mensajes y 1 archivos restaurados.');
    expect(isRestoreTerminalStatus(status.status)).toBe(true);
  });
});
