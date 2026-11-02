import {
  BaseBotError,
  ErrorCode,
  type DeepPartial,
  type BaseBotConfig,
  type DurableStoreAdapter,
  type HookRegistry,
  type MessageCacheAdapter,
  type ToolDefinition,
} from '@basebot/core';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';

import { createTurnQueue } from '../queue/queue.js';
import { startWorker, type WorkerHandle } from '../queue/worker.js';
import { registerMessageRoutes } from '../routes/messages.js';
import { registerStreamRoutes } from '../routes/stream.js';
import { registerThreadRoutes } from '../routes/threads.js';
import { registerHealthRoutes } from '../routes/health.js';
import { BaseBotRuntime } from '../runtime.js';
import type { InProcessToolHandler } from '../tools/runner.js';
import type { LLMConfig } from '../llm/types.js';

export interface CreateServerOptions {
  store: DurableStoreAdapter;
  cache: MessageCacheAdapter;
  redis: Redis;
  config?: DeepPartial<BaseBotConfig>;
  /** HMAC secret for stream tokens. Defaults to STREAM_SIGNING_SECRET env. */
  streamSigningSecret?: string;
  /** Start BullMQ worker in-process. Default: true */
  startWorker?: boolean;
  /** Route prefix when mounting as plugin. Default: '' */
  prefix?: string;
}

export interface BaseBotServer extends FastifyInstance {
  runtime: BaseBotRuntime;
  worker: WorkerHandle | null;
}

type PendingTool = { definition: ToolDefinition; handler?: InProcessToolHandler };

const pendingTools: PendingTool[] = [];
let pendingHooks: HookRegistry = {};
let pendingLlmConfig: LLMConfig | null = null;

export function registerTool(
  definition: ToolDefinition,
  inProcessHandler?: InProcessToolHandler,
): void {
  const entry: PendingTool = { definition };
  if (inProcessHandler) {
    entry.handler = inProcessHandler;
  }
  pendingTools.push(entry);
}

export function registerHooks(hooks: HookRegistry): void {
  pendingHooks = { ...pendingHooks, ...hooks };
}

export function configureLLM(config: LLMConfig): void {
  pendingLlmConfig = config;
}

export async function createServer(options: CreateServerOptions): Promise<BaseBotServer> {
  const secret =
    options.streamSigningSecret ??
    process.env.STREAM_SIGNING_SECRET ??
    'dev-stream-secret-change-me';

  const runtimeOptions: ConstructorParameters<typeof BaseBotRuntime>[0] = {
    store: options.store,
    cache: options.cache,
    redis: options.redis,
    streamSigningSecret: secret,
  };
  if (options.config) {
    runtimeOptions.config = options.config;
  }

  const runtime = new BaseBotRuntime(runtimeOptions);

  for (const { definition, handler } of pendingTools) {
    if (handler) {
      runtime.toolRunner.register(definition, handler);
    } else {
      runtime.toolRunner.register(definition);
    }
  }

  if (Object.keys(pendingHooks).length > 0) {
    runtime.registerHooks(pendingHooks);
  }

  if (pendingLlmConfig) {
    runtime.configureLLM(pendingLlmConfig);
  }

  const app = Fastify({
    logger: false,
    requestIdHeader: 'x-correlation-id',
  });

  const botServer = app as unknown as BaseBotServer;
  botServer.runtime = runtime;

  await botServer.register(cors, { origin: true });

  botServer.setErrorHandler((error, request, reply) => {
    const correlationId =
      typeof request.headers['x-correlation-id'] === 'string'
        ? request.headers['x-correlation-id']
        : undefined;

    if (error instanceof BaseBotError) {
      return reply.status(error.statusCode).send(error.toJSON());
    }

    const err = error as { validation?: unknown; message?: string };
    if (err.validation) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: err.message ?? 'Validation error',
        correlation_id: correlationId,
      });
    }

    return reply.status(500).send({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
      correlation_id: correlationId,
    });
  });

  const queue = createTurnQueue(options.redis);
  const startWorkerFlag = options.startWorker ?? true;
  botServer.worker = startWorkerFlag ? startWorker(runtime, options.redis) : null;

  const prefix = options.prefix ?? '';

  await botServer.register(
    (scoped) => {
      registerHealthRoutes(scoped, runtime);
      registerThreadRoutes(scoped, runtime);
      registerMessageRoutes(scoped, runtime, queue);
      registerStreamRoutes(scoped, runtime);
    },
    { prefix },
  );

  botServer.addHook('onClose', async () => {
    await queue.close();
    if (botServer.worker) {
      await botServer.worker.close();
    }
    await runtime.close();
  });

  return botServer;
}
