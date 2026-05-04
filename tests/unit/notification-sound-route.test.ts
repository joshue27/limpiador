import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getVerifiedSession: vi.fn(),
  mkdir: vi.fn(async () => undefined),
  writeFile: vi.fn(async () => undefined),
  revalidatePath: vi.fn(),
}));

vi.mock('@/modules/auth/guards', () => ({ getVerifiedSession: mocks.getVerifiedSession }));
vi.mock('node:fs/promises', () => ({ mkdir: mocks.mkdir, writeFile: mocks.writeFile }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

describe('notification sound route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects non-admin uploads', async () => {
    mocks.getVerifiedSession.mockResolvedValue({ userId: 'op-1', role: 'OPERATOR' });
    const { POST } = await import('@/app/api/settings/notification-sound/route');

    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it('allows admin uploads', async () => {
    mocks.getVerifiedSession.mockResolvedValue({ userId: 'admin-1', role: 'ADMIN' });
    const { POST } = await import('@/app/api/settings/notification-sound/route');

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(mocks.writeFile).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/settings');
  });
});

function createRequest() {
  const formData = new FormData();
  formData.set('sound', new File([new Uint8Array([1, 2, 3])], 'tone.mp3', { type: 'audio/mpeg' }));
  formData.set('type', 'message');
  return new Request('http://localhost/api/settings/notification-sound', { method: 'POST', body: formData });
}
