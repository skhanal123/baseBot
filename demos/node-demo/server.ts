import {
  configureLLM,
  createPostgresAdapter,
  createRedisMessageCache,
  createServer,
  registerTool,
  runMigrations,
  type LLMConfig,
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

function optionalModel(envValue: string | undefined): Pick<LLMConfig, 'model'> {
  return envValue ? { model: envValue } : {};
}

function resolveLLMConfig(): LLMConfig {
  const provider = process.env.LLM_PROVIDER?.trim().toLowerCase();

  if (provider === 'gemini') {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('LLM_PROVIDER=gemini requires GEMINI_API_KEY');
    }
    return { provider: 'gemini', ...optionalModel(process.env.GEMINI_MODEL) };
  }

  if (provider === 'claude') {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('LLM_PROVIDER=claude requires ANTHROPIC_API_KEY');
    }
    return { provider: 'claude', ...optionalModel(process.env.ANTHROPIC_MODEL) };
  }

  if (provider === 'deepseek') {
    if (!process.env.DEEPSEEK_API_KEY) {
      throw new Error('LLM_PROVIDER=deepseek requires DEEPSEEK_API_KEY');
    }
    return { provider: 'deepseek', ...optionalModel(process.env.DEEPSEEK_MODEL) };
  }

  if (provider === 'openai') {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('LLM_PROVIDER=openai requires OPENAI_API_KEY');
    }
    return {
      provider: 'openai',
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    };
  }

  if (provider === 'mock') {
    return {
      provider: 'mock',
      mockResponse:
        'Your order shipped yesterday. (mock LLM — set OPENAI_API_KEY or LLM_PROVIDER + provider API key)',
    };
  }

  if (provider) {
    throw new Error(
      `Unknown LLM_PROVIDER "${provider}". Use openai, gemini, claude, deepseek, or mock.`,
    );
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    };
  }

  return {
    provider: 'mock',
    mockResponse:
      'Your order shipped yesterday. (mock LLM — set OPENAI_API_KEY or LLM_PROVIDER + provider API key)',
  };
}

configureLLM(resolveLLMConfig());

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
