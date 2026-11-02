import type { FastifyInstance } from 'fastify';

import type { BaseBotRuntime } from '../runtime.js';

export function registerHealthRoutes(
  app: FastifyInstance,
  runtime: BaseBotRuntime,
): void {
  app.get('/health', () => ({ status: 'ok' }));

  app.get('/health/ready', async (_request, reply) => {
    try {
      await runtime.redis.ping();
      await runtime.store.getThread('00000000-0000-0000-0000-000000000000');
      return { status: 'ready' };
    } catch {
      return reply.status(503).send({ status: 'not_ready' });
    }
  });
}
