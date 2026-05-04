import { describe, expect, it } from 'vitest';

import { buildConversationSearchResult, splitTextSearchMatches } from '@/modules/inbox/chat-search';
import type { ConversationSearchMessage } from '@/modules/inbox/chat-search';

describe('buildConversationSearchResult', () => {
  const messages = [
    {
      id: 'm1',
      body: 'Factura lista para enviar',
      caption: null,
      mediaAssets: [],
    },
    {
      id: 'm2',
      body: null,
      caption: 'Adjunto factura final',
      mediaAssets: [{ id: 'a1', filename: 'factura-marzo.pdf', mimeType: 'application/pdf' }],
    },
    {
      id: 'm3',
      body: 'Seguimiento sin coincidencias',
      caption: null,
      mediaAssets: [],
    },
  ];

  it('finds matches in body, caption and attachment filename preserving reading order', () => {
    const result = buildConversationSearchResult(messages, 'factura', 1);

    expect(result.total).toBe(3);
    expect(result.activeMatchIndex).toBe(1);
    expect(result.matches.map((match) => `${match.messageId}:${match.field}`)).toEqual([
      'm1:body',
      'm2:caption',
      'm2:filename',
    ]);
  });

  it('trims the query, ignores blank searches and clamps the requested match index', () => {
    expect(buildConversationSearchResult(messages, '   ', 3)).toMatchObject({
      query: '',
      total: 0,
      activeMatchIndex: -1,
    });

    const result = buildConversationSearchResult(messages, 'factura', 99);

    expect(result.total).toBe(3);
    expect(result.activeMatchIndex).toBe(2);
    expect(result.activeMatch?.field).toBe('filename');
  });

  it('searches full conversation (more than visible window) and counts matches beyond position 20', () => {
    // Simulate 50 messages where matches exist outside what would be the 20-message display window
    const fullConversation: ConversationSearchMessage[] = Array.from(
      { length: 50 },
      (_, i) => ({
        id: `msg-${i}`,
        body: i === 0 ? 'Factura #001 — primera factura' : `Mensaje ${i}`,
        caption: i === 45 ? 'Referencia: factura urgente' : null,
        mediaAssets: i === 30
          ? [{ id: `asset-${i}`, filename: 'factura-enero.xlsx', mimeType: 'application/vnd.ms-excel' }]
          : [],
      }),
    );

    const result = buildConversationSearchResult(fullConversation, 'factura');

    // Should find matches across the full conversation, not just first 20
    expect(result.total).toBe(4);
    expect(result.matches).toHaveLength(4);

    const matchIds = result.matches.map((m) => `${m.messageId}:${m.field}`);
    expect(matchIds).toContain('msg-0:body');       // position 0
    expect(matchIds).toContain('msg-30:filename');   // position 30 (beyond 20)
    expect(matchIds).toContain('msg-45:caption');    // position 45 (beyond 20)
  });

  it('returns empty result when no matches exist in full conversation', () => {
    const fullConversation: ConversationSearchMessage[] = Array.from(
      { length: 30 },
      (_, i) => ({
        id: `msg-${i}`,
        body: `Mensaje ${i}`,
        caption: null,
        mediaAssets: [],
      }),
    );

    const result = buildConversationSearchResult(fullConversation, 'factura');
    expect(result.total).toBe(0);
    expect(result.matches).toHaveLength(0);
    expect(result.activeMatch).toBeNull();
  });

  it('handles empty message list gracefully', () => {
    const result = buildConversationSearchResult([], 'test');
    expect(result.total).toBe(0);
    expect(result.matches).toEqual([]);
  });

  it('preserves search result structure (no new fields) for UI compatibility', () => {
    const result = buildConversationSearchResult(messages, 'factura', 0);

    // Verify the result shape matches what the UI expects
    expect(result).toHaveProperty('query');
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('activeMatchIndex');
    expect(result).toHaveProperty('activeMatch');
    expect(result).toHaveProperty('matches');

    // matches preserve expected fields
    const firstMatch = result.matches[0];
    expect(firstMatch).toHaveProperty('index');
    expect(firstMatch).toHaveProperty('messageId');
    expect(firstMatch).toHaveProperty('field');
    expect(firstMatch).toHaveProperty('start');
    expect(firstMatch).toHaveProperty('end');

    // No unexpected fields
    const knownKeys = ['index', 'messageId', 'field', 'assetId', 'start', 'end'];
    for (const key of Object.keys(firstMatch)) {
      expect(knownKeys).toContain(key);
    }
  });
});

describe('splitTextSearchMatches', () => {
  it('splits repeated matches and flags only the active occurrence', () => {
    const parts = splitTextSearchMatches('Factura y otra factura', [
      { index: 0, start: 0, end: 7 },
      { index: 1, start: 15, end: 22 },
    ], 1);

    expect(parts).toEqual([
      { index: 0, text: 'Factura', highlighted: true, active: false },
      { text: ' y otra ', highlighted: false, active: false },
      { index: 1, text: 'factura', highlighted: true, active: true },
    ]);
  });
});
