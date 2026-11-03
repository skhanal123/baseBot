import type { DurableStoreAdapter, MessageCacheAdapter } from '@basebot/core';
import type { Redis } from 'ioredis';
import { expect } from 'vitest';

import { ContextManager } from '../context/context-manager.js';
import { configureLLM, createServer } from './create-server.js';

export async function runContextIsolationTrials(
  store: DurableStoreAdapter,
  cache: MessageCacheAdapter,
): Promise<void> {
  const contextManager = new ContextManager({ store, cache, messageLimit: 8 });
  const users = Array.from({ length: 10 }, () => `usr_${crypto.randomUUID()}`);
  const threadMap = new Map<string, string[]>();

  for (const userId of users) {
    const threads: string[] = [];
    for (let t = 0; t < 3; t++) {
      const thread = await store.createThread(userId);
      threads.push(thread.id);

      for (let m = 0; m < 5; m++) {
        const msg = await store.insertMessage({
          id: crypto.randomUUID(),
          thread_id: thread.id,
          user_id: userId,
          role: 'user',
          content: `secret-${userId}-thread-${thread.id}-msg-${m}`,
          metadata: {},
        });
        await cache.appendMessage(thread.id, msg);
      }
    }
    threadMap.set(userId, threads);
  }

  for (let trial = 0; trial < 1000; trial++) {
    const userId = users[trial % users.length] as string;
    const threads = threadMap.get(userId) as string[];
    const threadId = threads[trial % threads.length] as string;

    const context = await contextManager.loadContext(threadId);

    for (const msg of context) {
      expect(msg.thread_id).toBe(threadId);
      expect(msg.user_id).toBe(userId);
      expect(msg.content).toContain(userId);
      expect(msg.content).toContain(threadId);

      for (const [otherUser, otherThreads] of threadMap) {
        if (otherUser === userId) {
          continue;
        }
        for (const otherThread of otherThreads) {
          expect(msg.content).not.toContain(otherThread);
          expect(msg.content).not.toContain(`secret-${otherUser}`);
        }
      }
    }
  }
}

export async function runWorkerAclSmokeTest(
  store: DurableStoreAdapter,
  cache: MessageCacheAdapter,
  redis: Redis,
): Promise<void> {
  configureLLM({ provider: 'mock', mockTtftMs: 10, mockResponse: 'ok' });

  const server = await createServer({
    store,
    cache,
    redis,
    streamSigningSecret: 'iso-secret',
  });

  await server.listen({ port: 0, host: '127.0.0.1' });
  const addr = server.server.address();
  const port = addr && typeof addr === 'object' ? addr.port : 0;
  const baseUrl = `http://127.0.0.1:${String(port)}`;

  const userA = `usr_${crypto.randomUUID()}`;

  const createRes = await fetch(`${baseUrl}/v1/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userA }),
  });
  const { thread_id } = (await createRes.json()) as { thread_id: string };

  const sendRes = await fetch(`${baseUrl}/v1/threads/${thread_id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userA, content: 'test' }),
  });
  const { job_id, stream_token } = (await sendRes.json()) as {
    job_id: string;
    stream_token: string;
  };

  const streamRes = await fetch(
    `${baseUrl}/v1/stream/${job_id}?token=${encodeURIComponent(stream_token)}`,
  );
  const text = await streamRes.text();
  expect(text).toContain('message.end');

  await server.close();
}
