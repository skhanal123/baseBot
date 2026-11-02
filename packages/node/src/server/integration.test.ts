import { ErrorCode, MAX_THREADS_PER_USER } from '@basebot/core';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresAdapter } from '../adapters/postgres/postgres-adapter.js';
import { runMigrations } from '../adapters/postgres/migrate.js';
import { createRedisMessageCache } from '../adapters/redis/message-cache.js';
import { configureLLM, createServer } from './create-server.js';

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
const describeIntegration = databaseUrl && redisUrl ? describe : describe.skip;

describeIntegration('createServer integration', () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const redis = new Redis(redisUrl as string, { maxRetriesPerRequest: null });
  const store = createPostgresAdapter(pool);
  const cache = createRedisMessageCache(redis, { keyPrefix: 'integ' });

  let baseUrl = '';
  let server: Awaited<ReturnType<typeof createServer>>;

  beforeAll(async () => {
    await runMigrations(pool);
    await pool.query('TRUNCATE messages, threads RESTART IDENTITY CASCADE');

    configureLLM({ provider: 'mock', mockTtftMs: 50, mockResponse: 'Hello from mock LLM' });

    server = await createServer({
      store,
      cache,
      redis,
      streamSigningSecret: 'test-secret',
      config: { queue: { concurrency: 2, alwaysAsync: true } },
    });

    await server.listen({ port: 0, host: '127.0.0.1' });
    const addr = server.server.address();
    if (addr && typeof addr === 'object') {
      baseUrl = `http://127.0.0.1:${String(addr.port)}`;
    }
  });

  afterAll(async () => {
    await server.close();
    await pool.end();
    await redis.quit();
  });

  it('creates thread and enforces limit', async () => {
    const userId = `usr_${crypto.randomUUID()}`;

    for (let i = 0; i < MAX_THREADS_PER_USER; i++) {
      const res = await fetch(`${baseUrl}/v1/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      expect(res.status).toBe(201);
    }

    const sixth = await fetch(`${baseUrl}/v1/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    expect(sixth.status).toBe(409);
    const body = (await sixth.json()) as { code: string };
    expect(body.code).toBe(ErrorCode.THREAD_LIMIT_EXCEEDED);
  });

  it('denies cross-user thread access', async () => {
    const userA = `usr_${crypto.randomUUID()}`;
    const userB = `usr_${crypto.randomUUID()}`;

    const createRes = await fetch(`${baseUrl}/v1/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userA }),
    });
    const { thread_id } = (await createRes.json()) as { thread_id: string };

    const denied = await fetch(`${baseUrl}/v1/threads/${thread_id}/messages?user_id=${userB}`);
    expect(denied.status).toBe(403);
  });

  it('streams assistant response via SSE', async () => {
    const userId = `usr_${crypto.randomUUID()}`;

    const createRes = await fetch(`${baseUrl}/v1/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    const { thread_id } = (await createRes.json()) as { thread_id: string };

    const sendRes = await fetch(`${baseUrl}/v1/threads/${thread_id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, content: 'Hi there' }),
    });
    expect(sendRes.status).toBe(202);

    const sendBody = (await sendRes.json()) as {
      job_id: string;
      stream_token: string;
    };

    const streamRes = await fetch(
      `${baseUrl}/v1/stream/${sendBody.job_id}?token=${encodeURIComponent(sendBody.stream_token)}`,
    );
    expect(streamRes.status).toBe(200);
    expect(streamRes.headers.get('content-type')).toContain('text/event-stream');

    const text = await streamRes.text();
    expect(text).toContain('event: message.start');
    expect(text).toContain('event: message.delta');
    expect(text).toContain('event: message.end');
    expect(text).toContain('Hello from mock LLM');
  });

  it('replays SSE events to late subscribers', async () => {
    const userId = `usr_${crypto.randomUUID()}`;

    const createRes = await fetch(`${baseUrl}/v1/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    const { thread_id } = (await createRes.json()) as { thread_id: string };

    const sendRes = await fetch(`${baseUrl}/v1/threads/${thread_id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, content: 'Late stream test' }),
    });
    const sendBody = (await sendRes.json()) as {
      job_id: string;
      stream_token: string;
    };

    // Worker typically finishes before a human (or script) opens SSE.
    await new Promise((resolve) => setTimeout(resolve, 500));

    const streamRes = await fetch(
      `${baseUrl}/v1/stream/${sendBody.job_id}?token=${encodeURIComponent(sendBody.stream_token)}`,
    );
    expect(streamRes.status).toBe(200);

    const text = await streamRes.text();
    expect(text).toContain('event: message.start');
    expect(text).toContain('event: message.end');
  });

  it('health endpoints respond', async () => {
    const live = await fetch(`${baseUrl}/health`);
    expect(live.status).toBe(200);

    const ready = await fetch(`${baseUrl}/health/ready`);
    expect(ready.status).toBe(200);
  });
});
