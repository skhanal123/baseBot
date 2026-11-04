import type { LLMConfig } from '@basebot/node';
import { resolveLlmConfigFromEnv } from '@basebot/node';

export type DemoDurableStore = 'postgres' | 'mongo';

export interface DemoConfig {
  durableStore: DemoDurableStore;
  databaseUrl: string;
  mongoUrl: string;
  redisUrl: string;
  port: number;
  streamSigningSecret: string;
  llm: LLMConfig;
  /** OpenAI key for demo embeddings + optional chat provider (see LLM_PROVIDER). */
  openaiApiKey: string;
  serperApiKey?: string;
  toolsHttp: boolean;
  toolsHttpBaseUrl?: string;
}

function requireEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name} (see demos/node-demo/.env.example)`);
  }
  return value;
}

function parseDurableStore(env: NodeJS.ProcessEnv): DemoDurableStore {
  const raw = requireEnv('DURABLE_STORE', env).toLowerCase();
  if (raw === 'postgres' || raw === 'mongo') {
    return raw;
  }
  throw new Error(`DURABLE_STORE must be "postgres" or "mongo", got "${raw}"`);
}

/**
 * Demo / integrator config from env. The framework never reads these variables —
 * this module maps env → explicit `createServer` options.
 */
export function loadDemoConfig(env: NodeJS.ProcessEnv = process.env): DemoConfig {
  const durableStore = parseDurableStore(env);
  const databaseUrl = requireEnv('DATABASE_URL', env);
  const mongoUrl = requireEnv('MONGODB_URL', env);
  const redisUrl = requireEnv('REDIS_URL', env);
  const streamSigningSecret = requireEnv('STREAM_SIGNING_SECRET', env);
  const openaiApiKey = requireEnv('OPENAI_API_KEY', env);

  const portRaw = env.PORT?.trim();
  const port = portRaw ? Number(portRaw) : 3000;
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`PORT must be a positive number, got "${portRaw ?? ''}"`);
  }

  const toolsHttp = env.TELECOM_TOOLS_HTTP === '1';
  const serperApiKey = env.SERPER_API_KEY?.trim();

  const llm = resolveLlmConfigFromEnv({
    env,
    mockResponse: DEMO_MOCK_RESPONSE,
  });

  const config: DemoConfig = {
    durableStore,
    databaseUrl,
    mongoUrl,
    redisUrl,
    port,
    streamSigningSecret,
    llm,
    openaiApiKey,
    toolsHttp,
  };

  if (serperApiKey) {
    config.serperApiKey = serperApiKey;
  }

  if (toolsHttp) {
    config.toolsHttpBaseUrl =
      env.TELECOM_TOOLS_HTTP_BASE?.trim() ?? `http://127.0.0.1:${String(port)}`;
  }

  return config;
}

export const DEMO_MOCK_RESPONSE =
  'Telecom demo — set OPENAI_API_KEY and run pnpm demo:setup for tool-calling conversations.';
