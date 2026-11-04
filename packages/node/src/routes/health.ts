import type { FastifyInstance } from 'fastify';
import type { Queue } from 'bullmq';

import type { TurnJobData } from '../queue/types.js';
import type { WorkerHandle } from '../queue/worker.js';
import type { BaseBotRuntime } from '../runtime.js';
import { collectReadinessChecks, readinessStatus } from './health-probes.js';

export interface HealthRouteOptions {
  runtime: BaseBotRuntime;
  queue: Queue<TurnJobData, TurnJobData>;
  worker: WorkerHandle | null;
}

export function registerHealthRoutes(
  app: FastifyInstance,
  options: HealthRouteOptions,
): void {
  const { runtime, queue, worker } = options;

  app.get('/health', () => ({ status: 'ok' as const }));

  app.get('/health/ready', async (_request, reply) => {
    const checks = await collectReadinessChecks(
      runtime.redis,
      runtime.store,
      queue,
      worker,
    );
    const status = readinessStatus(checks);
    const body = { status, ...checks };

    if (status === 'ok') {
      return body;
    }

    return reply.status(503).send(body);
  });
}
