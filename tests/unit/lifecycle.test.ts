import { describe, expect, it, vi } from 'vitest';

import { createLifecycle } from '@/lib/lifecycle';

describe('lifecycle', () => {
  it('closes registered resources in reverse order and exits successfully on SIGTERM', async () => {
    const events: string[] = [];
    const exit = vi.fn();
    const lifecycle = createLifecycle({
      logger: { info: (event) => events.push(event), warn: (event) => events.push(event), error: (event) => events.push(event) },
      exit,
      timeoutMs: 250,
    });

    lifecycle.register('prisma', async () => {
      events.push('prisma.closed');
    });
    lifecycle.register('redis', async () => {
      events.push('redis.closed');
    });

    await lifecycle.shutdown('SIGTERM');

    expect(events).toEqual(['shutdown_started', 'redis.closed', 'prisma.closed', 'shutdown_complete']);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('is idempotent when shutdown is requested more than once', async () => {
    const close = vi.fn(async () => undefined);
    const lifecycle = createLifecycle({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      exit: vi.fn(),
      timeoutMs: 250,
    });
    lifecycle.register('queue', close);

    await Promise.all([lifecycle.shutdown('SIGINT'), lifecycle.shutdown('SIGTERM')]);

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('logs and exits with failure when a resource exceeds the shutdown timeout', async () => {
    const errors: string[] = [];
    const exit = vi.fn();
    const lifecycle = createLifecycle({
      logger: { info: vi.fn(), warn: vi.fn(), error: (event) => errors.push(event) },
      exit,
      timeoutMs: 1,
    });

    lifecycle.register('stuck-worker', () => new Promise((resolve) => setTimeout(resolve, 50)));

    await lifecycle.shutdown('SIGTERM');

    expect(errors).toContain('shutdown_failed');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('logs unhandled rejections and uncaught exceptions before failing closed', async () => {
    const events: string[] = [];
    const exit = vi.fn();
    const lifecycle = createLifecycle({
      logger: { info: vi.fn(), warn: vi.fn(), error: (event) => events.push(event) },
      exit,
      timeoutMs: 250,
    });

    await lifecycle.handleUnhandledRejection(new Error('escaped rejection'));
    await lifecycle.handleUncaughtException(new TypeError('programmer bug'));

    expect(events).toContain('unhandled_rejection');
    expect(events).toContain('uncaught_exception');
    expect(exit).toHaveBeenCalledWith(1);
  });
});
