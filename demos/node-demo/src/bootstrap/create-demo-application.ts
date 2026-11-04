import type { DurableStoreAdapter } from '@basebot/core';
import {
  connectMongo,
  createPostgresAdapter,
  createRedisMessageCache,
  createServer,
  runMigrations,
  type BaseBotServer,
  type CreateServerOptions,
} from '@basebot/node';
import type { Db } from 'mongodb';
import { Redis } from 'ioredis';
import { Pool } from 'pg';

import { loadDemoConfig, type DemoConfig } from '../config/load-demo-config.js';
import { runDemoMigrations } from '../db/run-demo-migrations.js';
import {
  getTelecomToolRegistrations,
  registerTelecomToolHttpRoutes,
  type RegisterTelecomToolsOptions,
} from '../tools/register-tools.js';
import type { TelecomToolBackend } from '../tools/telecom-backend.js';

export interface DemoApplication {
  app: BaseBotServer;
  redis: Redis;
  onShutdown: () => Promise<void>;
  port: number;
  durableStore: string;
  toolsMode: 'inprocess' | 'http';
}

function buildTelecomBackend(
  config: DemoConfig,
  pool: Pool | null,
  mongoDb: Db | null,
): TelecomToolBackend {
  const serper = config.serperApiKey ? { serperApiKey: config.serperApiKey } : {};

  if (config.durableStore === 'mongo') {
    if (!mongoDb) throw new Error('Mongo DB handle missing');
    return {
      kind: 'mongo',
      mongoDb,
      openaiApiKey: config.openaiApiKey,
      ...serper,
    };
  }
  if (!pool) throw new Error('Postgres pool missing');
  return {
    kind: 'postgres',
    pool,
    openaiApiKey: config.openaiApiKey,
    ...serper,
  };
}

async function createDurableStore(config: DemoConfig): Promise<{
  store: DurableStoreAdapter;
  onShutdown: () => Promise<void>;
  pool: Pool | null;
  mongoDb: Db | null;
}> {
  if (config.durableStore === 'mongo') {
    const mongo = await connectMongo(config.mongoUrl);
    const dbName = new URL(config.mongoUrl).pathname.replace(/^\//, '') || 'basebot';
    return {
      store: mongo.store,
      mongoDb: mongo.client.db(dbName),
      pool: null,
      onShutdown: () => mongo.close(),
    };
  }

  const pool = new Pool({ connectionString: config.databaseUrl });
  await runMigrations(pool);
  await runDemoMigrations(pool);
  return {
    store: createPostgresAdapter(pool),
    pool,
    mongoDb: null,
    onShutdown: async () => {
      await pool.end();
    },
  };
}

/** US-16/US-17: maps demo config → explicit `createServer` options (no framework env reads). */
export async function createDemoApplication(
  config: DemoConfig = loadDemoConfig(),
): Promise<DemoApplication> {
  const { store, onShutdown, pool, mongoDb } = await createDurableStore(config);

  const telecomBackend = buildTelecomBackend(config, pool, mongoDb);
  const telecomToolOptions: RegisterTelecomToolsOptions = config.toolsHttp
    ? {
        backend: telecomBackend,
        mode: 'http',
        httpBaseUrl: config.toolsHttpBaseUrl!,
      }
    : {
        backend: telecomBackend,
        mode: 'inprocess',
      };

  const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

  const serverOptions: CreateServerOptions = {
    store,
    cache: createRedisMessageCache(redis),
    redis,
    streamSigningSecret: config.streamSigningSecret,
    llm: config.llm,
    tools: getTelecomToolRegistrations(telecomToolOptions),
  };

  if (config.toolsHttp) {
    serverOptions.registerRoutes = (server) => {
      registerTelecomToolHttpRoutes(server, telecomToolOptions);
    };
  }

  const app = await createServer(serverOptions);

  return {
    app,
    redis,
    onShutdown,
    port: config.port,
    durableStore: config.durableStore,
    toolsMode: config.toolsHttp ? 'http' : 'inprocess',
  };
}
