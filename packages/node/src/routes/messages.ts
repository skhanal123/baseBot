import {
  BaseBotError,
  ErrorCode,
  ListMessagesQuerySchema,
  SendMessageRequestSchema,
  type MessageRecord,
} from '@basebot/core';
import type { FastifyInstance } from 'fastify';
import type { Queue } from 'bullmq';
import type { TurnJobData } from '../queue/types.js';

import { assertThreadAccess } from '../acl/thread-acl.js';
import { enqueueTurn } from '../queue/queue.js';
import type { BaseBotRuntime } from '../runtime.js';
import { createStreamToken } from '../stream/stream-token.js';
import { resolveCorrelationId } from '../utils/correlation.js';
import { newJobId, newMessageId } from '../utils/ids.js';

function toMessageRecord(message: {
  id: string;
  thread_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}): MessageRecord {
  return {
    id: message.id,
    thread_id: message.thread_id,
    user_id: message.user_id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp.toISOString(),
    metadata: message.metadata,
  };
}

export function registerMessageRoutes(
  app: FastifyInstance,
  runtime: BaseBotRuntime,
  queue: Queue<TurnJobData, TurnJobData>,
): void {
  app.post<{ Params: { id: string } }>(
    '/v1/threads/:id/messages',
    async (request, reply) => {
      const correlationId = resolveCorrelationId(request.headers['x-correlation-id']);
      const parsed = SendMessageRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new BaseBotError(
          ErrorCode.VALIDATION_ERROR,
          parsed.error.errors.map((e) => e.message).join('; '),
          correlationId,
        );
      }

      const threadId = request.params.id;
      await assertThreadAccess(runtime.store, threadId, parsed.data.user_id, correlationId);

      const hookResult = await runtime.hookPipeline.run('before_user_message', {
        user_id: parsed.data.user_id,
        thread_id: threadId,
        content: parsed.data.content,
        correlation_id: correlationId,
      });

      if (!hookResult.allowed) {
        throw new BaseBotError(
          ErrorCode.HOOK_REJECTED,
          hookResult.reason ?? 'Message rejected by hook',
          correlationId,
        );
      }

      const messageId = newMessageId();
      const userMessage = await runtime.store.insertMessage({
        id: messageId,
        thread_id: threadId,
        user_id: parsed.data.user_id,
        role: 'user',
        content: hookResult.content,
        metadata: {},
      });

      await runtime.cache.appendMessage(threadId, userMessage);

      const jobId = newJobId();
      const jobData: TurnJobData = {
        job_id: jobId,
        thread_id: threadId,
        user_id: parsed.data.user_id,
        message_id: messageId,
        correlation_id: correlationId,
      };

      await enqueueTurn(queue, jobData);

      const { token, expiresAt } = createStreamToken(
        {
          job_id: jobId,
          user_id: parsed.data.user_id,
          thread_id: threadId,
        },
        runtime.streamSigningSecret,
        runtime.config.stream.tokenTtlSeconds,
      );

      return reply.status(202).send({
        job_id: jobId,
        message_id: messageId,
        stream_token: token,
        stream_expires_at: expiresAt.toISOString(),
      });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/v1/threads/:id/messages',
    async (request) => {
      const correlationId = resolveCorrelationId(request.headers['x-correlation-id']);
      const parsed = ListMessagesQuerySchema.safeParse({
        ...(request.query as object),
        user_id: (request.query as { user_id?: string }).user_id,
      });

      if (!parsed.success) {
        throw new BaseBotError(
          ErrorCode.VALIDATION_ERROR,
          parsed.error.errors.map((e) => e.message).join('; '),
          correlationId,
        );
      }

      const threadId = request.params.id;
      await assertThreadAccess(
        runtime.store,
        threadId,
        parsed.data.user_id,
        correlationId,
      );

      const page = await runtime.store.listMessages(
        threadId,
        parsed.data.cursor ?? null,
        parsed.data.page_size,
      );

      return {
        messages: page.messages.map(toMessageRecord),
        next_cursor: page.nextCursor,
      };
    },
  );
}
