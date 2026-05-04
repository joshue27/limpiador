import { classifyError } from './errors';
import { logger as defaultLogger, serializeError, type Logger } from './logger';

type ShutdownSignal = 'SIGTERM' | 'SIGINT' | 'unhandledRejection' | 'uncaughtException' | string;
type ShutdownResource = {
  name: string;
  close: () => Promise<void> | void;
};

type ProcessLike = {
  on: (event: NodeJS.Signals | 'unhandledRejection' | 'uncaughtException', handler: (...args: unknown[]) => void) => unknown;
};

export type LifecycleLogger = Pick<Logger, 'info' | 'warn' | 'error'>;

export type LifecycleOptions = {
  timeoutMs?: number;
  logger?: Partial<LifecycleLogger>;
  exit?: (code: number) => void;
};

export type Lifecycle = {
  register: (name: string, close: () => Promise<void> | void) => () => void;
  shutdown: (reason: ShutdownSignal) => Promise<void>;
  handleUnhandledRejection: (reason: unknown) => Promise<void>;
  handleUncaughtException: (error: unknown) => Promise<void>;
  attachProcessHandlers: (target?: ProcessLike) => void;
};

const DEFAULT_TIMEOUT_MS = 10_000;

export function createLifecycle(options: LifecycleOptions = {}): Lifecycle {
  const resources: ShutdownResource[] = [];
  const log = mergeLogger(options.logger);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const exit = options.exit ?? ((code) => process.exit(code));
  let shutdownPromise: Promise<void> | undefined;
  let handlersAttached = false;

  const register = (name: string, close: () => Promise<void> | void) => {
    const resource = { name, close };
    resources.push(resource);
    return () => {
      const index = resources.indexOf(resource);
      if (index >= 0) resources.splice(index, 1);
    };
  };

  const shutdown = async (reason: ShutdownSignal) => {
    shutdownPromise ??= runShutdown({ resources, reason, timeoutMs, logger: log, exit });
    return shutdownPromise;
  };

  const handleUnhandledRejection = async (reason: unknown) => {
    const classified = classifyError(reason);
    log.error('unhandled_rejection', { err: serializeError(reason), classification: classified });
    await shutdown('unhandledRejection');
  };

  const handleUncaughtException = async (error: unknown) => {
    const classified = classifyError(error);
    log.error('uncaught_exception', { err: serializeError(error), classification: classified });
    await shutdown('uncaughtException');
  };

  const attachProcessHandlers = (target: ProcessLike = process) => {
    if (handlersAttached) return;
    handlersAttached = true;
    target.on('SIGTERM', () => void shutdown('SIGTERM'));
    target.on('SIGINT', () => void shutdown('SIGINT'));
    target.on('unhandledRejection', (reason) => void handleUnhandledRejection(reason));
    target.on('uncaughtException', (error) => void handleUncaughtException(error));
  };

  return { register, shutdown, handleUnhandledRejection, handleUncaughtException, attachProcessHandlers };
}

const defaultLifecycle = createLifecycle();

export function registerShutdownResource(name: string, close: () => Promise<void> | void): () => void {
  return defaultLifecycle.register(name, close);
}

export function installProcessHandlers(): void {
  defaultLifecycle.attachProcessHandlers();
}

async function runShutdown(input: {
  resources: ShutdownResource[];
  reason: ShutdownSignal;
  timeoutMs: number;
  logger: LifecycleLogger;
  exit: (code: number) => void;
}): Promise<void> {
  input.logger.info('shutdown_started', { reason: input.reason });

  try {
    await withTimeout(closeResources(input.resources), input.timeoutMs);
    input.logger.info('shutdown_complete', { reason: input.reason });
    input.exit(isFailureReason(input.reason) ? 1 : 0);
  } catch (error) {
    input.logger.error('shutdown_failed', {
      reason: input.reason,
      err: serializeError(error),
    });
    input.exit(1);
  }
}

async function closeResources(resources: ShutdownResource[]): Promise<void> {
  for (const resource of [...resources].reverse()) {
    await resource.close();
  }
}

function isFailureReason(reason: ShutdownSignal): boolean {
  return reason === 'unhandledRejection' || reason === 'uncaughtException';
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Shutdown exceeded ${timeoutMs}ms`)), timeoutMs);
    timer.unref?.();
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function mergeLogger(logger: Partial<LifecycleLogger> | undefined): LifecycleLogger {
  return {
    info: logger?.info ?? defaultLogger.info,
    warn: logger?.warn ?? defaultLogger.warn,
    error: logger?.error ?? defaultLogger.error,
  };
}
