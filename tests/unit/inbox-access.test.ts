import { describe, expect, it } from 'vitest';

import { canViewConversationSnapshot } from '@/modules/inbox/access';

const operator = { userId: 'u1', email: 'op@example.com', name: null, role: 'OPERATOR' as const };
const admin = { userId: 'admin', email: 'admin@example.com', name: null, role: 'ADMIN' as const };

describe('canViewConversationSnapshot', () => {
  it('allows admins to see every conversation', () => {
    expect(canViewConversationSnapshot(admin, { id: 'c1', status: 'CLAIMED', assignedDepartmentId: 'ventas', assignedToId: 'u2' }, [])).toBe(true);
  });

  it('allows operators to see their department queue but not another department queue', () => {
    expect(canViewConversationSnapshot(operator, { id: 'c1', status: 'DEPARTMENT_QUEUE', assignedDepartmentId: 'ventas', assignedToId: null }, ['ventas'])).toBe(true);
    expect(canViewConversationSnapshot(operator, { id: 'c2', status: 'DEPARTMENT_QUEUE', assignedDepartmentId: 'contabilidad', assignedToId: null }, ['ventas'])).toBe(false);
  });

  it('keeps claimed conversations private to the assignee', () => {
    expect(canViewConversationSnapshot(operator, { id: 'c1', status: 'CLAIMED', assignedDepartmentId: 'ventas', assignedToId: 'u1' }, ['ventas'])).toBe(true);
    expect(canViewConversationSnapshot(operator, { id: 'c2', status: 'CLAIMED', assignedDepartmentId: 'ventas', assignedToId: 'u2' }, ['ventas'])).toBe(false);
  });
});
