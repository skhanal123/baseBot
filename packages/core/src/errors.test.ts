import { describe, expect, it } from 'vitest';

import { BaseBotError, ErrorCode, ErrorHttpStatus } from './errors.js';
import { CreateThreadRequestSchema, SendMessageRequestSchema } from './schemas/api.js';
import { DEFAULT_MAX_MESSAGE_CONTENT_BYTES } from './types/message.js';
import { MAX_THREADS_PER_USER, USER_ID_MAX_LENGTH } from './types/thread.js';
import { mergeConfig } from './types/config.js';

describe('ErrorCode', () => {
  it('maps each code to the documented HTTP status', () => {
    expect(ErrorHttpStatus[ErrorCode.STREAM_TOKEN_INVALID]).toBe(401);
    expect(ErrorHttpStatus[ErrorCode.STREAM_TOKEN_EXPIRED]).toBe(401);
    expect(ErrorHttpStatus[ErrorCode.THREAD_ACCESS_DENIED]).toBe(403);
    expect(ErrorHttpStatus[ErrorCode.THREAD_LIMIT_EXCEEDED]).toBe(409);
    expect(ErrorHttpStatus[ErrorCode.VALIDATION_ERROR]).toBe(400);
    expect(ErrorHttpStatus[ErrorCode.HOOK_REJECTED]).toBe(422);
    expect(ErrorHttpStatus[ErrorCode.INTERNAL_ERROR]).toBe(500);
  });

  it('serializes BaseBotError to JSON body', () => {
    const err = new BaseBotError(ErrorCode.THREAD_ACCESS_DENIED, 'denied', 'corr_1');
    expect(err.toJSON()).toEqual({
      code: ErrorCode.THREAD_ACCESS_DENIED,
      message: 'denied',
      correlation_id: 'corr_1',
    });
  });
});

describe('CreateThreadRequestSchema', () => {
  it('accepts valid user_id', () => {
    const result = CreateThreadRequestSchema.safeParse({ user_id: 'usr_abc' });
    expect(result.success).toBe(true);
  });

  it('rejects empty user_id', () => {
    const result = CreateThreadRequestSchema.safeParse({ user_id: '' });
    expect(result.success).toBe(false);
  });

  it('rejects user_id over max length', () => {
    const result = CreateThreadRequestSchema.safeParse({
      user_id: 'x'.repeat(USER_ID_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });
});

describe('SendMessageRequestSchema', () => {
  it('rejects content over 32KB', () => {
    const result = SendMessageRequestSchema.safeParse({
      user_id: 'usr_1',
      content: 'x'.repeat(DEFAULT_MAX_MESSAGE_CONTENT_BYTES + 1),
    });
    expect(result.success).toBe(false);
  });
});

describe('mergeConfig', () => {
  it('applies defaults and partial overrides', () => {
    const config = mergeConfig({ cache: { messageLimit: 16 } });
    expect(config.cache.messageLimit).toBe(16);
    expect(config.cache.ttlSeconds).toBe(86400);
    expect(config.queue.concurrency).toBe(20);
  });
});

describe('constants', () => {
  it('enforces 5 thread limit per user', () => {
    expect(MAX_THREADS_PER_USER).toBe(5);
  });
});
