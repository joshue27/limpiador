export type FullTextSql = {
  text: string;
  values: Array<string | number>;
};

const MAX_TERMS = 8;
const MAX_TERM_LENGTH = 32;

export function normalizeFullTextQuery(query: string | null | undefined): string {
  const terms = (query ?? '')
    .normalize('NFKC')
    .match(/[\p{L}\p{N}]+/gu)
    ?.map((term) => term.slice(0, MAX_TERM_LENGTH))
    .filter((term) => term.length >= 2)
    .slice(0, MAX_TERMS) ?? [];

  return terms.map((term) => `${term}:*`).join(' & ');
}

export function buildConversationFullTextSearchSql(input: {
  query: string;
  accessWhereSql: string;
  limit: number;
}): FullTextSql {
  const normalized = normalizeFullTextQuery(input.query);
  return {
    text: `
      SELECT c.id
      FROM conversations c
      JOIN contacts ct ON ct.id = c.contact_id
      LEFT JOIN messages m ON m.conversation_id = c.id AND m.hidden_globally = false
      WHERE (${input.accessWhereSql})
        AND websearch_to_tsquery('spanish', $1) @@ (
          setweight(to_tsvector('spanish', coalesce(ct.display_name, '') || ' ' || coalesce(ct.phone, '') || ' ' || coalesce(ct.wa_id, '')), 'A') ||
          setweight(to_tsvector('spanish', coalesce(m.body, '') || ' ' || coalesce(m.caption, '')), 'B')
        )
      GROUP BY c.id
      ORDER BY max(c.last_message_at) DESC NULLS LAST
      LIMIT $2
    `,
    values: [normalized, input.limit],
  };
}
