import { describe, expect, it } from 'vitest';

import { buildCampaignCsvHeaderMap, buildCampaignRecipientSummaryMap } from '@/modules/campaigns/list-metrics';

describe('campaign list metrics helpers', () => {
  it('aggregates recipient counts by campaign and status', () => {
    const summaries = buildCampaignRecipientSummaryMap([
      { campaignId: 'campaign-1', status: 'PENDING', count: 2 },
      { campaignId: 'campaign-1', status: 'SENT', count: 3 },
      { campaignId: 'campaign-2', status: 'FAILED', count: 1 },
    ]);

    expect(summaries.get('campaign-1')).toEqual({
      total: 5,
      counts: { PENDING: 2, SENT: 3 },
    });
    expect(summaries.get('campaign-2')).toEqual({
      total: 1,
      counts: { FAILED: 1 },
    });
  });

  it('builds sorted unique CSV header lists per campaign', () => {
    const headers = buildCampaignCsvHeaderMap([
      { campaignId: 'campaign-1', header: 'telefono' },
      { campaignId: 'campaign-1', header: 'nombre' },
      { campaignId: 'campaign-1', header: 'telefono' },
      { campaignId: 'campaign-2', header: 'factura' },
    ]);

    expect(headers.get('campaign-1')).toEqual(['nombre', 'telefono']);
    expect(headers.get('campaign-2')).toEqual(['factura']);
  });
});
