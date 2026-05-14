export type WhatsAppInlineToken = {
  type: 'text' | 'bold' | 'italic' | 'strike' | 'code';
  value: string;
};

export type WhatsAppParagraph = {
  lines: WhatsAppInlineToken[][];
};

const inlineMarkers = ['*', '_', '~'] as const;

function findClosingMarker(input: string, marker: string, start: number) {
  const end = input.indexOf(marker, start + marker.length);
  if (end <= start + marker.length) return -1;
  return end;
}

export function parseWhatsAppInline(input: string): WhatsAppInlineToken[] {
  const tokens: WhatsAppInlineToken[] = [];
  let cursor = 0;

  while (cursor < input.length) {
    if (input.startsWith('```', cursor)) {
      const end = input.indexOf('```', cursor + 3);
      if (end > cursor + 3) {
        tokens.push({ type: 'code', value: input.slice(cursor + 3, end) });
        cursor = end + 3;
        continue;
      }
    }

    const marker = inlineMarkers.find((candidate) => input.startsWith(candidate, cursor));
    if (marker) {
      const end = findClosingMarker(input, marker, cursor);
      if (end !== -1) {
        const value = input.slice(cursor + 1, end);
        const type = marker === '*' ? 'bold' : marker === '_' ? 'italic' : 'strike';
        tokens.push({ type, value });
        cursor = end + 1;
        continue;
      }
    }

    let next = input.length;
    const nextCode = input.indexOf('```', cursor + 1);
    if (nextCode !== -1) next = Math.min(next, nextCode);

    for (const markerCandidate of inlineMarkers) {
      const markerIndex = input.indexOf(markerCandidate, cursor + 1);
      if (markerIndex !== -1) next = Math.min(next, markerIndex);
    }

    tokens.push({ type: 'text', value: input.slice(cursor, next) });
    cursor = next;
  }

  return tokens.filter((token) => token.value.length > 0);
}

export function wrapWhatsAppSelection(input: string, prefix: string, suffix = prefix) {
  const normalized = input.replace(/\r\n?/g, '\n');
  if (!normalized.includes('\n')) return `${prefix}${normalized}${suffix}`;

  return normalized
    .split('\n')
    .map((line) => (line ? `${prefix}${line}${suffix}` : line))
    .join('\n');
}

export function parseWhatsAppText(input: string): WhatsAppParagraph[] {
  const normalized = input.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];

  return normalized.split(/\n{2,}/).map((paragraph) => ({
    lines: paragraph.split('\n').map((line) => parseWhatsAppInline(line)),
  }));
}
