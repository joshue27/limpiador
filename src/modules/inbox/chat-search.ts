export type ConversationSearchAsset = {
  id: string;
  filename: string | null;
  mimeType: string;
};

export type ConversationSearchMessage = {
  id: string;
  body: string | null;
  caption: string | null;
  mediaAssets: ConversationSearchAsset[];
};

export type ConversationSearchField = 'body' | 'caption' | 'filename';

export type ConversationSearchMatch = {
  index: number;
  messageId: string;
  field: ConversationSearchField;
  assetId?: string;
  start: number;
  end: number;
};

export type ConversationSearchResult = {
  query: string;
  total: number;
  activeMatchIndex: number;
  activeMatch: ConversationSearchMatch | null;
  matches: ConversationSearchMatch[];
};

export type TextSearchSlice = {
  index?: number;
  text: string;
  highlighted: boolean;
  active: boolean;
};

function normalizeQuery(query: string | null | undefined) {
  return query?.trim().slice(0, 80) ?? '';
}

function collectMatches(text: string, normalizedQuery: string, base: Omit<ConversationSearchMatch, 'index' | 'start' | 'end'>) {
  const source = text.toLocaleLowerCase('es');
  const needle = normalizedQuery.toLocaleLowerCase('es');
  const matches: Omit<ConversationSearchMatch, 'index'>[] = [];
  let cursor = 0;

  while (cursor <= source.length - needle.length) {
    const start = source.indexOf(needle, cursor);
    if (start === -1) break;
    matches.push({ ...base, start, end: start + needle.length });
    cursor = start + needle.length;
  }

  return matches;
}

export function buildConversationSearchResult(messages: ConversationSearchMessage[], query: string | null | undefined, requestedIndex = 0): ConversationSearchResult {
  const normalizedQuery = normalizeQuery(query);

  if (!normalizedQuery) {
    return {
      query: '',
      total: 0,
      activeMatchIndex: -1,
      activeMatch: null,
      matches: [],
    };
  }

  const matches = messages.flatMap((message) => {
    const textMatches = [
      ...(message.body ? collectMatches(message.body, normalizedQuery, { messageId: message.id, field: 'body' }) : []),
      ...(message.caption ? collectMatches(message.caption, normalizedQuery, { messageId: message.id, field: 'caption' }) : []),
    ];

    const filenameMatches = message.mediaAssets.flatMap((asset) => (
      asset.filename
        ? collectMatches(asset.filename, normalizedQuery, { messageId: message.id, field: 'filename', assetId: asset.id })
        : []
    ));

    return [...textMatches, ...filenameMatches];
  }).map((match, index) => ({ ...match, index }));

  if (matches.length === 0) {
    return {
      query: normalizedQuery,
      total: 0,
      activeMatchIndex: -1,
      activeMatch: null,
      matches: [],
    };
  }

  const activeMatchIndex = Math.min(Math.max(requestedIndex, 0), matches.length - 1);

  return {
    query: normalizedQuery,
    total: matches.length,
    activeMatchIndex,
    activeMatch: matches[activeMatchIndex] ?? null,
    matches,
  };
}

export function splitTextSearchMatches(text: string, matches: Array<Pick<ConversationSearchMatch, 'index' | 'start' | 'end'>>, activeMatchIndex: number) {
  if (!matches.length) return [{ text, highlighted: false, active: false }] satisfies TextSearchSlice[];

  const parts: TextSearchSlice[] = [];
  let cursor = 0;

  for (const match of matches) {
    if (match.start > cursor) {
      parts.push({ text: text.slice(cursor, match.start), highlighted: false, active: false });
    }

    parts.push({
      index: match.index,
      text: text.slice(match.start, match.end),
      highlighted: true,
      active: match.index === activeMatchIndex,
    });

    cursor = match.end;
  }

  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), highlighted: false, active: false });
  }

  return parts;
}
