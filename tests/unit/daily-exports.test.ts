import { describe, expect, it } from 'vitest';

import { buildDriveExportPlan, buildDriveFolderNames } from '@/worker/daily-exports';

describe('daily exports folder planning', () => {
  it('keeps month subfolders for scheduled daily exports', () => {
    const now = new Date('2026-05-02T14:30:15.000Z');

    expect(buildDriveFolderNames(now, 'daily')).toEqual(['2026-05']);
  });

  it('adds a timestamped subfolder for manual backups', () => {
    const now = new Date('2026-05-02T14:30:15.000Z');

    expect(buildDriveFolderNames(now, 'manual')).toEqual(['2026-05', 'manual-2026-05-02-143015']);
  });

  it('keeps daily exports incremental', () => {
    const now = new Date('2026-05-02T14:30:15.000Z');

    expect(buildDriveExportPlan(now, 'daily')).toMatchObject({
      trigger: 'daily',
      logPrefix: '[daily-export]',
      uploadPrefix: '',
      window: {
        mode: 'incremental',
        from: '2026-05-02',
        to: '2026-05-02',
      },
    });
  });

  it('switches manual backups to full export mode', () => {
    const now = new Date('2026-05-02T14:30:15.000Z');

    expect(buildDriveExportPlan(now, 'manual')).toEqual({
      trigger: 'manual',
      folderNames: ['2026-05', 'manual-2026-05-02-143015'],
      logPrefix: '[manual-drive-backup]',
      uploadPrefix: 'manual-full',
      window: { mode: 'full' },
    });
  });
});
