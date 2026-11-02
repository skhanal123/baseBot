import {
  configureLLM,
  createPostgresAdapter,
  createRedisMessageCache,
  createServer,
  registerTool,
  runMigrations,
} from '@basebot/node';
import { Redis } from 'ioredis';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://basebot:basebot@localhost:5434/basebot';
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const port = Number(process.env.PORT ?? 3000);

registerTool(
  {
    name: 'get_order_status',
    description: 'Returns the status of a customer order by order ID',
    parameters: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order identifier' },
      },
      required: ['order_id'],
    },
    handler: 'inprocess:get_order_status',
  },
  async ({ arguments: args, context }) => {
    const orderId = String(args.order_id ?? 'unknown');
    return JSON.stringify({
      order_id: orderId,
      status: 'shipped',
      user_id: context.user_id,
      thread_id: context.thread_id,
    });
  },
);

if (process.env.OPENAI_API_KEY) {
  configureLLM({ provider: 'openai', model: 'gpt-4o-mini' });
} else {
  configureLLM({
    provider: 'mock',
    mockResponse: 'Your order shipped yesterday. (mock LLM — set OPENAI_API_KEY for real responses)',
  });
}

const pool = new Pool({ connectionString: databaseUrl });
const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });

await runMigrations(pool);

const app = await createServer({
  store: createPostgresAdapter(pool),
  cache: createRedisMessageCache(redis),
  redis,
  streamSigningSecret: process.env.STREAM_SIGNING_SECRET,
});

await app.listen({ port, host: '0.0.0.0' });
console.log(`baseBot demo server listening on http://localhost:${String(port)}`);
