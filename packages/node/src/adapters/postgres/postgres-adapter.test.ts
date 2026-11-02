import {
  BaseBotError,
  ErrorCode,
  MAX_THREADS_PER_USER,
  type Message,
} from '@basebot/core';
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

  afterAll(async () => {
    await pool.end();
  });

  it('creates and retrieves threads', async () => {
    const userId = `usr_${randomUUID()}`;
    const thread = await adapter.createThread(userId);
    expect(thread.user_id).toBe(userId);
    expect(thread.status).toBe('active');

    const fetched = await adapter.getThread(thread.id);
    expect(fetched?.id).toBe(thread.id);
  });

  it('enforces 5-thread limit per user', async () => {
    const userId = `usr_${randomUUID()}`;
    for (let i = 0; i < MAX_THREADS_PER_USER; i++) {
      await adapter.createThread(userId);
    }

    await expect(adapter.createThread(userId)).rejects.toMatchObject({
      code: ErrorCode.THREAD_LIMIT_EXCEEDED,
    });
  });

  it('inserts messages and paginates history', async () => {
    const userId = `usr_${randomUUID()}`;
    const thread = await adapter.createThread(userId);

    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const msg = await adapter.insertMessage({
        id: randomUUID(),
        thread_id: thread.id,
        user_id: userId,
        role: 'user',
        content: `message ${i}`,
        metadata: {},
      });
      ids.push(msg.id);
    }

    const page = await adapter.listMessages(thread.id, null, 2);
    expect(page.messages).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();

    const page2 = await adapter.listMessages(thread.id, page.nextCursor, 2);
    expect(page2.messages).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
  });

  it('loads recent messages for cache backfill', async () => {
    const userId = `usr_${randomUUID()}`;
    const thread = await adapter.createThread(userId);

    for (let i = 0; i < 10; i++) {
      await adapter.insertMessage({
        id: randomUUID(),
        thread_id: thread.id,
        user_id: userId,
        role: 'user',
        content: `msg ${i}`,
        metadata: {},
      });
    }

    const recent = await adapter.getRecentMessages(thread.id, 8);
    expect(recent).toHaveLength(8);
    expect(recent[0]?.content).toBe('msg 2');
    expect(recent[7]?.content).toBe('msg 9');
  });
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
