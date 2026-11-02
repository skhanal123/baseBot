import { BaseBotError, ErrorCode } from '@basebot/core';
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface StreamTokenPayload {
  job_id: string;
  user_id: string;
  thread_id: string;
  exp: number;
}

function encodePayload(payload: StreamTokenPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodePayload(encoded: string): StreamTokenPayload {
  const json = Buffer.from(encoded, 'base64url').toString('utf8');
  return JSON.parse(json) as StreamTokenPayload;
}

function sign(encoded: string, secret: string): string {
  return createHmac('sha256', secret).update(encoded).digest('base64url');
}

export function createStreamToken(
  payload: Omit<StreamTokenPayload, 'exp'>,
  secret: string,
  ttlSeconds: number,
): { token: string; expiresAt: Date } {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const full: StreamTokenPayload = { ...payload, exp };
  const encoded = encodePayload(full);
  const signature = sign(encoded, secret);
  return {
    token: `${encoded}.${signature}`,
    expiresAt: new Date(exp * 1000),
  };
}

export function verifyStreamToken(
  token: string,
  secret: string,
  correlationId?: string,
): StreamTokenPayload {
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new BaseBotError(
      ErrorCode.STREAM_TOKEN_INVALID,
      'Invalid stream token format',
      correlationId,
    );
  }

  const [encoded, providedSig] = parts as [string, string];
  const expectedSig = sign(encoded, secret);

  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new BaseBotError(
      ErrorCode.STREAM_TOKEN_INVALID,
      'Invalid stream token signature',
      correlationId,
    );
  }

  let payload: StreamTokenPayload;
  try {
    payload = decodePayload(encoded);
  } catch {
    throw new BaseBotError(
      ErrorCode.STREAM_TOKEN_INVALID,
      'Invalid stream token payload',
      correlationId,
    );
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new BaseBotError(
      ErrorCode.STREAM_TOKEN_EXPIRED,
      'Stream token has expired',
      correlationId,
    );
  }

  return payload;
}
