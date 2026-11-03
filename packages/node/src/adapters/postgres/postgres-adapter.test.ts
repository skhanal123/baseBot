import { BaseBotError, ErrorCode, type Message } from '@basebot/core';
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { registerDurableStoreAdapterTests } from '../durable/durable-store.test-suite.js';
import { createPostgresAdapter } from './postgres-adapter.js';
import { runMigrations } from './migrate.js';
import { createRedisMessageCache } from '../redis/message-cache.js';

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
const describeIntegration = databaseUrl && redisUrl ? describe : describe.skip;

describeIntegration('PostgresAdapter', () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = createPostgresAdapter(pool);

  beforeAll(async () => {
    await runMigrations(pool);
    await pool.query('TRUNCATE messages, threads RESTART IDENTITY CASCADE');
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE messages, threads RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await pool.end();
  });

  registerDurableStoreAdapterTests(() => ({
    adapter,
    reset: async () => {
      await pool.query('TRUNCATE messages, threads RESTART IDENTITY CASCADE');
    },
  }));
});

describeIntegration('RedisMessageCache', () => {
  const redis = new Redis(redisUrl as string, { maxRetriesPerRequest: 1 });
  const cache = createRedisMessageCache(redis, { keyPrefix: 'test' });

  beforeAll(async () => {
    const keys = await redis.keys('test:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterAll(async () => {
    const keys = await redis.keys('test:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await redis.quit();
  });

  function makeMessage(index: number, threadId: string): Message {
    return {
      id: randomUUID(),
      thread_id: threadId,
      user_id: 'usr_1',
      role: 'user',
      content: `content ${index}`,
      timestamp: new Date(Date.now() + index),
      metadata: {},
    };
  }

  it('trims list to last 8 messages', async () => {
    const threadId = randomUUID();
    for (let i = 0; i < 10; i++) {
      await cache.appendMessage(threadId, makeMessage(i, threadId));
    }

    const messages = await cache.getMessages(threadId);
    expect(messages).toHaveLength(8);
    expect(messages[0]?.content).toBe('content 2');
    expect(messages[7]?.content).toBe('content 9');
  });

  it('sets TTL on append', async () => {
    const threadId = randomUUID();
    await cache.appendMessage(threadId, makeMessage(0, threadId));
    const ttl = await redis.ttl(`test:${threadId}:messages`);
    expect(ttl).toBeGreaterThan(0);
  });

  it('backfills via setMessages', async () => {
    const threadId = randomUUID();
    const messages = Array.from({ length: 5 }, (_, i) => makeMessage(i, threadId));
    await cache.setMessages(threadId, messages);

    const cached = await cache.getMessages(threadId);
    expect(cached).toHaveLength(5);
  });

  it('returns empty array on cache miss', async () => {
    const messages = await cache.getMessages(randomUUID());
    expect(messages).toEqual([]);
  });

  it('purges cache key', async () => {
    const threadId = randomUUID();
    await cache.appendMessage(threadId, makeMessage(0, threadId));
    await cache.purge(threadId);
    expect(await cache.hasCache(threadId)).toBe(false);
  });
});

describe('PostgresAdapter unit', () => {
  it('throws THREAD_LIMIT_EXCEEDED with correct code', () => {
    const err = new BaseBotError(ErrorCode.THREAD_LIMIT_EXCEEDED, 'limit');
    expect(err).toBeInstanceOf(BaseBotError);
    expect(err.statusCode).toBe(409);
  });
});
