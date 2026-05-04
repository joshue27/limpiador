import { describe, expect, it } from 'vitest';

import { formatSseEvent, parseRealtimeTopics } from '@/modules/realtime/sse';

describe('realtime SSE helpers', () => {
  it('formats named events with JSON data and a stable id', () => {
    expect(formatSseEvent({ id: '42', event: 'digest', data: { inbox: 'a:b', exports: 'c:d' } })).toBe(
      'id: 42\nevent: digest\ndata: {"inbox":"a:b","exports":"c:d"}\n\n',
    );
  });

  it('keeps only supported topics for authenticated streams', () => {
    expect(parseRealtimeTopics('inbox,exports,unknown,notifications')).toEqual(['inbox', 'exports', 'notifications']);
    expect(parseRealtimeTopics(null)).toEqual(['inbox', 'exports', 'notifications']);
  });
});
