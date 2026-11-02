import {
  BaseBotError,
  CreateThreadRequestSchema,
  ErrorCode,
  ListThreadsQuerySchema,
  type ThreadSummary,
} from '@basebot/core';
import type { FastifyInstance } from 'fastify';

import { assertThreadAccess } from '../acl/thread-acl.js';
import type { BaseBotRuntime } from '../runtime.js';
import { resolveCorrelationId } from '../utils/correlation.js';

function toThreadSummary(thread: {
  id: string;
  user_id: string;
  created_at: Date;
  last_message_at: Date;
  status: 'active' | 'archived';
}): ThreadSummary {
  return {
    id: thread.id,
    user_id: thread.user_id,
    created_at: thread.created_at.toISOString(),
    last_message_at: thread.last_message_at.toISOString(),
    status: thread.status,
  };
}

export function registerThreadRoutes(
  app: FastifyInstance,
  runtime: BaseBotRuntime,
): void {
  app.post('/v1/threads', async (request, reply) => {
    const correlationId = resolveCorrelationId(request.headers['x-correlation-id']);
    const parsed = CreateThreadRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BaseBotError(
        ErrorCode.VALIDATION_ERROR,
        parsed.error.errors.map((e) => e.message).join('; '),
        correlationId,
      );
    }

    try {
      const thread = await runtime.store.createThread(parsed.data.user_id);
      return await reply.status(201).send({ thread_id: thread.id });
    } catch (err) {
      if (err instanceof BaseBotError) {
        throw err;
      }
      throw new BaseBotError(ErrorCode.INTERNAL_ERROR, 'Failed to create thread', correlationId);
    }
  });

  app.get('/v1/threads', async (request) => {
    const correlationId = resolveCorrelationId(request.headers['x-correlation-id']);
    const parsed = ListThreadsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new BaseBotError(
        ErrorCode.VALIDATION_ERROR,
        parsed.error.errors.map((e) => e.message).join('; '),
        correlationId,
      );
    }

    const threads = await runtime.store.listThreads(parsed.data.user_id);
    return { threads: threads.map(toThreadSummary) };
  });

  app.get<{ Params: { id: string } }>(
    '/v1/threads/:id',
    async (request) => {
      const correlationId = resolveCorrelationId(request.headers['x-correlation-id']);
      const userId = (request.query as { user_id?: string }).user_id;
      if (!userId) {
        throw new BaseBotError(ErrorCode.VALIDATION_ERROR, 'user_id is required', correlationId);
      }

      await assertThreadAccess(runtime.store, request.params.id, userId, correlationId);
      const thread = await runtime.store.getThread(request.params.id);
      return { thread: thread ? toThreadSummary(thread) : null };
    },
  );
}
