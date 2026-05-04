export type CampaignRecipientCountRow = {
  campaignId: string;
  status: string;
  count: number;
};

export type CampaignCsvHeaderRow = {
  campaignId: string;
  header: string;
};

export type CampaignRecipientSummary = {
  total: number;
  counts: Record<string, number>;
};

export function buildCampaignRecipientSummaryMap(rows: CampaignRecipientCountRow[]) {
  const summaries = new Map<string, CampaignRecipientSummary>();

  for (const row of rows) {
    const existing = summaries.get(row.campaignId) ?? { total: 0, counts: {} };
    existing.counts[row.status] = (existing.counts[row.status] ?? 0) + row.count;
    existing.total += row.count;
    summaries.set(row.campaignId, existing);
  }

  return summaries;
}

export function buildCampaignCsvHeaderMap(rows: CampaignCsvHeaderRow[]) {
  const headersByCampaign = new Map<string, Set<string>>();

  for (const row of rows) {
    const headers = headersByCampaign.get(row.campaignId) ?? new Set<string>();
    headers.add(row.header);
    headersByCampaign.set(row.campaignId, headers);
  }

  return new Map(
    [...headersByCampaign.entries()].map(([campaignId, headers]) => [campaignId, [...headers].sort()]),
  );
}
