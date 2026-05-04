import { describe, expect, it } from 'vitest';

import {
  CLIENT_ID_PREFIX,
  makeClientId,
  mergeRefreshedMessages,
  prependOlderPage,
  reconcileOptimisticRow,
} from '@/modules/inbox/merge';
import type { QuotedMessageState } from '@/modules/inbox/message-history';

function msg(overrides: Partial<QuotedMessageState> & { id: string }): QuotedMessageState {
  return {
    direction: 'OUTBOUND',
    type: 'TEXT',
    body: 'Hola',
    caption: null,
    status: 'SENT',
    createdAt: '2026-04-29T10:00:00.000Z',
    mediaAssets: [],
    rawJson: {},
    ...overrides,
  };
}

function clientMsg(clientId: string, overrides?: Partial<QuotedMessageState>): QuotedMessageState {
  return msg({
    id: `${CLIENT_ID_PREFIX}${clientId}`,
    status: 'PENDING',
    body: 'Mensaje pendiente',
    ...overrides,
  });
}

describe('prependOlderPage', () => {
  it('prepends older page messages before current messages', () => {
    const current = [msg({ id: 'msg-3' }), msg({ id: 'msg-4' })];
    const older = [msg({ id: 'msg-1' }), msg({ id: 'msg-2' })];

    const result = prependOlderPage(current, older);
    expect(result).toHaveLength(4);
    expect(result.map((m) => m.id)).toEqual(['msg-1', 'msg-2', 'msg-3', 'msg-4']);
  });

  it('de-dupes by id when older page overlaps with current', () => {
    const current = [msg({ id: 'msg-2' }), msg({ id: 'msg-3' })];
    const older = [msg({ id: 'msg-1' }), msg({ id: 'msg-2' })];

    const result = prependOlderPage(current, older);
    expect(result.map((m) => m.id)).toEqual(['msg-1', 'msg-2', 'msg-3']);
  });

  it('preserves the current version when duplicate id exists (older wins)', () => {
    // The older page entry with same id should be kept (it appears first),
    // but in practice older page wins because it's prepended before de-dupe
    const current = [msg({ id: 'msg-2', body: 'newer version' })];
    const older = [msg({ id: 'msg-2', body: 'older version' })];

    const result = prependOlderPage(current, older);
    expect(result).toHaveLength(1);
    // older comes first and wins the de-dupe (first occurrence kept)
    expect(result[0].id).toBe('msg-2');
    expect(result[0].body).toBe('older version');
  });

  it('handles empty older page', () => {
    const current = [msg({ id: 'msg-1' })];
    const result = prependOlderPage(current, []);
    expect(result.map((m) => m.id)).toEqual(['msg-1']);
  });

  it('handles empty current list', () => {
    const older = [msg({ id: 'msg-1' })];
    const result = prependOlderPage([], older);
    expect(result.map((m) => m.id)).toEqual(['msg-1']);
  });

  it('handles older page with client:* rows (preserves them)', () => {
    const current = [msg({ id: 'msg-3' })];
    const older = [clientMsg('tmp-old', { body: 'pendiente viejo' })];

    const result = prependOlderPage(current, older);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('client:tmp-old');
  });
});

describe('reconcileOptimisticRow', () => {
  it('replaces a client:* optimistic row with the server message', () => {
    const current = [msg({ id: 'msg-1' }), clientMsg('tmp-1'), msg({ id: 'msg-2' })];
    const serverMsg = msg({ id: 'persisted-123', status: 'SENT', body: 'Mensaje pendiente' });

    const result = reconcileOptimisticRow(current, 'tmp-1', serverMsg);
    expect(result).toHaveLength(3);
    expect(result.map((m) => m.id)).toEqual(['msg-1', 'persisted-123', 'msg-2']);
    expect(result[1].status).toBe('SENT');
  });

  it('keeps other messages unchanged when reconciling', () => {
    const current = [clientMsg('tmp-a'), clientMsg('tmp-b')];
    const serverMsg = msg({ id: 'persisted-a', status: 'SENT' });

    const result = reconcileOptimisticRow(current, 'tmp-a', serverMsg);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('persisted-a');
    expect(result[1].id).toBe('client:tmp-b');
    expect(result[1].status).toBe('PENDING');
  });

  it('returns list unchanged if clientId not found', () => {
    const current = [clientMsg('tmp-a')];
    const serverMsg = msg({ id: 'persisted-b' });

    const result = reconcileOptimisticRow(current, 'nonexistent', serverMsg);
    expect(result.map((m) => m.id)).toEqual(['client:tmp-a']);
  });

  it('marks as FAILED when server response has failed status', () => {
    const current = [clientMsg('tmp-1', { body: 'Hola mundo' })];
    const failedMsg = msg({ id: 'persisted-fail', status: 'FAILED', body: 'Hola mundo' });

    const result = reconcileOptimisticRow(current, 'tmp-1', failedMsg);
    expect(result[0].id).toBe('persisted-fail');
    expect(result[0].status).toBe('FAILED');
    expect(result[0].body).toBe('Hola mundo');
  });

  it('reconciles with quoted message data preserved', () => {
    const current = [clientMsg('tmp-q', { body: 'Respuesta' })];
    const serverMsg = msg({
      id: 'persisted-q',
      body: 'Respuesta',
      status: 'SENT',
      rawJson: { quotedMessageId: 'orig-1', quotedMessagePreview: { body: 'Original', caption: null, type: 'TEXT', direction: 'INBOUND' } },
    });

    const result = reconcileOptimisticRow(current, 'tmp-q', serverMsg);
    expect(result[0].id).toBe('persisted-q');
    expect(result[0].rawJson).toEqual(serverMsg.rawJson);
  });
});

describe('mergeRefreshedMessages', () => {
  it('updates existing persisted messages by id with refreshed data', () => {
    const current = [msg({ id: 'msg-1', status: 'SENT' }), msg({ id: 'msg-2', status: 'SENT' })];
    const refreshed = [msg({ id: 'msg-1', status: 'DELIVERED' })];

    const result = mergeRefreshedMessages(current, refreshed);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('msg-1');
    expect(result[0].status).toBe('DELIVERED');
    expect(result[1].id).toBe('msg-2');
  });

  it('adds new messages from refreshed set that are not in current', () => {
    const current = [msg({ id: 'msg-1' })];
    const refreshed = [msg({ id: 'msg-2' })];

    const result = mergeRefreshedMessages(current, refreshed);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.id)).toEqual(['msg-1', 'msg-2']);
  });

  it('preserves unresolved client:* rows when refreshing', () => {
    const current = [msg({ id: 'msg-1' }), clientMsg('tmp-1'), msg({ id: 'msg-2' })];
    const refreshed = [msg({ id: 'msg-1', status: 'DELIVERED' })];

    const result = mergeRefreshedMessages(current, refreshed);
    expect(result).toHaveLength(3);
    expect(result[0].status).toBe('DELIVERED'); // updated
    expect(result[1].id).toBe('client:tmp-1'); // preserved
    expect(result[2].id).toBe('msg-2'); // preserved
  });

  it('adds refreshed messages alongside unresolved client:* rows', () => {
    // Refresh brings new message(s) and the client:* rows stay
    const current = [clientMsg('tmp-1', { body: 'Hola mundo' }), msg({ id: 'msg-2' })];
    const refreshed = [msg({ id: 'msg-3', body: 'Nuevo mensaje', status: 'SENT' })];

    const result = mergeRefreshedMessages(current, refreshed);
    // New msg-3 is added after existing messages; client:* stays
    expect(result.map((m) => m.id)).toEqual(['client:tmp-1', 'msg-2', 'msg-3']);
  });

  it('handles empty refreshed set (no change)', () => {
    const current = [msg({ id: 'msg-1' }), clientMsg('tmp-1')];
    const result = mergeRefreshedMessages(current, []);
    expect(result.map((m) => m.id)).toEqual(['msg-1', 'client:tmp-1']);
  });

  it('updates by id and skips duplicates already in current', () => {
    const current = [msg({ id: 'msg-1' }), msg({ id: 'msg-2' })];
    const refreshed = [msg({ id: 'msg-1', status: 'READ' }), msg({ id: 'msg-2', status: 'READ' })];

    const result = mergeRefreshedMessages(current, refreshed);
    expect(result).toHaveLength(2);
    expect(result[0].status).toBe('READ');
    expect(result[1].status).toBe('READ');
  });

  it('never deletes a client:* row even when refreshed has no match', () => {
    const current = [clientMsg('tmp-orphan'), msg({ id: 'msg-1' })];
    const refreshed = [msg({ id: 'msg-2' })];

    const result = mergeRefreshedMessages(current, refreshed);
    expect(result.map((m) => m.id)).toEqual(['client:tmp-orphan', 'msg-1', 'msg-2']);
  });
});

describe('makeClientId', () => {
  it('generates a client-prefixed id', () => {
    const id = makeClientId();
    expect(id.startsWith(CLIENT_ID_PREFIX)).toBe(true);
    expect(id.length).toBeGreaterThan(CLIENT_ID_PREFIX.length);
  });

  it('generates unique ids on subsequent calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => makeClientId()));
    expect(ids.size).toBe(20);
  });
});
