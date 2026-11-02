import { BaseBotError, ErrorCode } from '@basebot/core';
import { describe, expect, it } from 'vitest';

import { createStreamToken, verifyStreamToken } from './stream-token.js';

describe('stream token', () => {
  const secret = 'test-secret';

  it('round-trips valid token', () => {
    const { token } = createStreamToken(
      { job_id: 'job_1', user_id: 'usr_1', thread_id: '550e8400-e29b-41d4-a716-446655440000' },
      secret,
      900,
    );

    const payload = verifyStreamToken(token, secret);
    expect(payload.job_id).toBe('job_1');
    expect(payload.user_id).toBe('usr_1');
  });

  it('rejects tampered token', () => {
    const { token } = createStreamToken(
      { job_id: 'job_1', user_id: 'usr_1', thread_id: '550e8400-e29b-41d4-a716-446655440000' },
      secret,
      900,
    );

    const tampered = `${token}x`;
    expect(() => verifyStreamToken(tampered, secret)).toThrowError(
      expect.objectContaining({ code: ErrorCode.STREAM_TOKEN_INVALID }),
    );
  });

  it('rejects expired token', () => {
    const { token } = createStreamToken(
      { job_id: 'job_1', user_id: 'usr_1', thread_id: '550e8400-e29b-41d4-a716-446655440000' },
      secret,
      -10,
    );

    expect(() => verifyStreamToken(token, secret)).toThrowError(
      expect.objectContaining({ code: ErrorCode.STREAM_TOKEN_EXPIRED }),
    );
  });

  it('throws BaseBotError instances', () => {
    try {
      verifyStreamToken('bad', secret);
    } catch (err) {
      expect(err).toBeInstanceOf(BaseBotError);
    }
  });
});
