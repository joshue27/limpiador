import { describe, expect, it } from 'vitest';

import { buildConversationFullTextSearchSql, normalizeFullTextQuery } from '@/modules/inbox/full-text-search';

describe('inbox full text search helpers', () => {
  it('normalizes user search into a safe prefix tsquery', () => {
    expect(normalizeFullTextQuery('  María López +502  ')).toBe('María:* & López:* & 502:*');
    expect(normalizeFullTextQuery('hola | DROP TABLE')).toBe('hola:* & DROP:* & TABLE:*');
  });

  it('drops empty and too-short punctuation-only searches', () => {
    expect(normalizeFullTextQuery('   -- ++ ')).toBe('');
    expect(normalizeFullTextQuery('a')).toBe('');
  });

  it('builds SQL against contacts and message text with access predicates supplied by the caller', () => {
    const sql = buildConversationFullTextSearchSql({
      query: 'factura urgente',
      limit: 25,
      accessWhereSql: 'c.status <> \'CLAIMED\'',
    });

    expect(sql.text).toContain('websearch_to_tsquery');
    expect(sql.text).toContain('contacts');
    expect(sql.text).toContain('messages');
    expect(sql.values).toContain('factura:* & urgente:*');
    expect(sql.values).toContain(25);
  });
});
