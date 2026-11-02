import { BaseBotError, ErrorCode, type StreamEvent } from '@basebot/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { BaseBotRuntime } from '../runtime.js';
import { formatSseEvent } from '../stream/stream-emitter.js';
import { verifyStreamToken } from '../stream/stream-token.js';
import { resolveCorrelationId } from '../utils/correlation.js';

/** Hijacked SSE responses skip @fastify/cors; reflect Origin like `{ origin: true }`. */
function streamCorsHeaders(request: FastifyRequest): Record<string, string> {
  const origin = request.headers.origin;
  if (typeof origin === 'string') {
    return {
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin',
    };
  }
  return {};
}

export function registerStreamRoutes(
  app: FastifyInstance,
  runtime: BaseBotRuntime,
): void {
  app.get<{ Params: { job_id: string } }>(
    '/v1/stream/:job_id',
    async (request, reply) => {
      const correlationId = resolveCorrelationId(request.headers['x-correlation-id']);
      const query = request.query as { token?: string };
      const authHeader = request.headers.authorization;
      const bearer =
        typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
          ? authHeader.slice(7)
          : undefined;
      const token = query.token ?? bearer;

      if (!token) {
        throw new BaseBotError(
          ErrorCode.STREAM_TOKEN_INVALID,
          'Stream token required',
          correlationId,
        );
      }

      const payload = verifyStreamToken(
        token,
        runtime.streamSigningSecret,
        correlationId,
      );

      if (payload.job_id !== request.params.job_id) {
        throw new BaseBotError(
          ErrorCode.STREAM_TOKEN_INVALID,
          'Token does not match job_id',
          correlationId,
        );
      }

      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        ...streamCorsHeaders(request),
      });

      let closed = false;
      let unsubscribe: () => Promise<void> = async () => {
        /* set after subscribe */
      };

      const deliver = (event: StreamEvent): void => {
        if (closed) {
          return;
        }
        reply.raw.write(formatSseEvent(event));
        if (event.event === 'message.end' || event.event === 'error') {
          closed = true;
          reply.raw.end();
          void unsubscribe();
        }
      };

      unsubscribe = await runtime.streamEmitter.subscribe(payload.job_id, deliver);

      request.raw.on('close', () => {
        closed = true;
        void unsubscribe();
      });
    },
  );
}
