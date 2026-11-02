/**
 * Standard baseBot error codes mapped to HTTP status.
 * @see docs/TDD.md — Standard Error Codes
 */
export const ErrorCode = {
  STREAM_TOKEN_INVALID: 'STREAM_TOKEN_INVALID',
  STREAM_TOKEN_EXPIRED: 'STREAM_TOKEN_EXPIRED',
  THREAD_ACCESS_DENIED: 'THREAD_ACCESS_DENIED',
  THREAD_LIMIT_EXCEEDED: 'THREAD_LIMIT_EXCEEDED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  HOOK_REJECTED: 'HOOK_REJECTED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ErrorHttpStatus: Record<ErrorCode, number> = {
  [ErrorCode.STREAM_TOKEN_INVALID]: 401,
  [ErrorCode.STREAM_TOKEN_EXPIRED]: 401,
  [ErrorCode.THREAD_ACCESS_DENIED]: 403,
  [ErrorCode.THREAD_LIMIT_EXCEEDED]: 409,
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.HOOK_REJECTED]: 422,
  [ErrorCode.INTERNAL_ERROR]: 500,
};

export interface BaseBotErrorBody {
  code: ErrorCode;
  message: string;
  correlation_id?: string;
}

export class BaseBotError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly correlationId?: string;

  constructor(code: ErrorCode, message: string, correlationId?: string) {
    super(message);
    this.name = 'BaseBotError';
    this.code = code;
    this.statusCode = ErrorHttpStatus[code];
    if (correlationId !== undefined) {
      this.correlationId = correlationId;
    }
  }

  toJSON(): BaseBotErrorBody {
    const body: BaseBotErrorBody = {
      code: this.code,
      message: this.message,
    };
    if (this.correlationId !== undefined) {
      body.correlation_id = this.correlationId;
    }
    return body;
  }
}
