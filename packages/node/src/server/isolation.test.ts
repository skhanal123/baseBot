import { MongoClient } from 'mongodb';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, it } from 'vitest';

import { createMongoAdapter } from '../adapters/mongo/mongo-adapter.js';
import { createPostgresAdapter } from '../adapters/postgres/postgres-adapter.js';
import { runMigrations } from '../adapters/postgres/migrate.js';
import { createRedisMessageCache } from '../adapters/redis/message-cache.js';
import { runContextIsolationTrials, runWorkerAclSmokeTest } from './isolation-suite.js';

const databaseUrl = process.env.DATABASE_URL;
const mongoUrl = process.env.MONGODB_URL;
const redisUrl = process.env.REDIS_URL;

function describeStoreIsolation(name: string, enabled: boolean): void {
  const describeIntegration = enabled && redisUrl ? describe : describe.skip;

  describeIntegration(`context isolation (${name})`, () => {
    const redis = new Redis(redisUrl as string, { maxRetriesPerRequest: null });
    let store: ReturnType<typeof createPostgresAdapter> | ReturnType<typeof createMongoAdapter>;
    let cleanupStore: () => Promise<void>;
    let resetStore: () => Promise<void>;

    beforeAll(async () => {
      if (name === 'postgres') {
        const pool = new Pool({ connectionString: databaseUrl });
        await runMigrations(pool);
        store = createPostgresAdapter(pool);
        resetStore = async () => {
          await pool.query('TRUNCATE messages, threads RESTART IDENTITY CASCADE');
        };
        cleanupStore = async () => {
          await pool.end();
        };
      } else {
        const client = new MongoClient(mongoUrl as string);
        await client.connect();
        store = createMongoAdapter(client, 'basebot_isolation_test');
        resetStore = async () => {
          const db = client.db('basebot_isolation_test');
          await db.collection('messages').deleteMany({});
          await db.collection('threads').deleteMany({});
        };
        cleanupStore = async () => {
          await client.close();
        };
      }

      await resetStore();
    });

    afterAll(async () => {
      await redis.quit();
      await cleanupStore();
    });

    it('never leaks messages across threads (1000 trials)', async () => {
      await resetStore();
      const cache = createRedisMessageCache(redis, { keyPrefix: `iso-${name}` });
      await runContextIsolationTrials(store, cache);
    });

    it('worker ACL rejects mismatched user_id on job', async () => {
      await resetStore();
      const cache = createRedisMessageCache(redis, { keyPrefix: `iso-acl-${name}` });
      await runWorkerAclSmokeTest(store, cache, redis);
    });
  });
}

describeStoreIsolation('postgres', Boolean(databaseUrl));
describeStoreIsolation('mongo', Boolean(mongoUrl));
