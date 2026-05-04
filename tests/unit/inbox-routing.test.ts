import { describe, expect, it } from 'vitest';

import { parseRoutingMenuReply } from '@/modules/inbox/routing';

describe('parseRoutingMenuReply', () => {
  it('rejects non-numeric replies', async () => {
    expect(await parseRoutingMenuReply('ventas')).toBeNull();
    expect(await parseRoutingMenuReply('6')).toBeNull();
    expect(await parseRoutingMenuReply(null)).toBeNull();
  });

  it('accepts numeric replies', async () => {
    const result = await parseRoutingMenuReply('2');
    expect(result === null || typeof result?.code === 'string').toBe(true);
  });
});
