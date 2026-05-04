type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogSink = (line: string) => void;
type LogContext = Record<string, unknown>;

const REDACTED = '[REDACTED]';
const SENSITIVE_KEY_PATTERN = /(?:password|passwd|secret|token|credential|authorization|cookie|email|mail|phone|pii)/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export type Logger = {
  debug: (event: string, context?: LogContext) => void;
  info: (event: string, context?: LogContext) => void;
  warn: (event: string, context?: LogContext) => void;
  error: (event: string, context?: LogContext) => void;
};

export type LoggerOptions = {
  sink?: LogSink;
  now?: () => Date;
  baseContext?: LogContext;
};

export function serializeError(error: unknown): LogContext {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause instanceof Error ? serializeError(error.cause) : error.cause,
    };
  }

  return { message: String(error) };
}

export function redactValue(value: unknown): unknown {
  if (value instanceof Error) {
    return redactValue(serializeError(value));
  }

  if (typeof value === 'string') {
    return value.replace(EMAIL_PATTERN, REDACTED);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactValue(entry),
      ]),
    );
  }

  return value;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const sink = options.sink ?? defaultSink;
  const now = options.now ?? (() => new Date());
  const baseContext = options.baseContext ?? {};

  const write = (level: LogLevel, event: string, context: LogContext = {}) => {
    const record = redactValue({
      timestamp: now().toISOString(),
      level,
      event,
      ...baseContext,
      ...context,
    });

    sink(JSON.stringify(record));
  };

  return {
    debug: (event, context) => write('debug', event, context),
    info: (event, context) => write('info', event, context),
    warn: (event, context) => write('warn', event, context),
    error: (event, context) => write('error', event, context),
  };
}

export const logger = createLogger();

function defaultSink(line: string): void {
  process.stdout.write(`${line}\n`);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
