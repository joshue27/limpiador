export type ErrorContext = Record<string, unknown>;

export type AppErrorCode =
  | 'LIMITER_UNAVAILABLE'
  | 'SHUTDOWN_FAILED'
  | 'VALIDATION_FAILED'
  | 'PROGRAMMER_ERROR'
  | (string & {});

export type AppErrorOptions = {
  statusCode?: number;
  isOperational?: boolean;
  context?: ErrorContext;
  cause?: unknown;
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly statusCode: number;
  readonly isOperational: boolean;
  readonly context: ErrorContext;

  constructor(code: AppErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.statusCode = options.statusCode ?? 500;
    this.isOperational = options.isOperational ?? true;
    this.context = options.context ?? {};
  }
}

export type ClassifiedError = {
  code: AppErrorCode;
  message: string;
  statusCode: number;
  isOperational: boolean;
  context: ErrorContext;
  cause?: unknown;
};

export function createOperationalError(
  code: AppErrorCode,
  message: string,
  options: Omit<AppErrorOptions, 'isOperational'> = {},
): AppError {
  return new AppError(code, message, { ...options, isOperational: true });
}

export function isOperationalError(error: unknown): error is AppError {
  return error instanceof AppError && error.isOperational;
}

export function classifyError(error: unknown): ClassifiedError {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
      isOperational: error.isOperational,
      context: error.context,
      cause: error.cause,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'PROGRAMMER_ERROR',
      message: error.message,
      statusCode: 500,
      isOperational: false,
      context: {},
      cause: error.cause,
    };
  }

  return {
    code: 'PROGRAMMER_ERROR',
    message: String(error),
    statusCode: 500,
    isOperational: false,
    context: {},
  };
}
