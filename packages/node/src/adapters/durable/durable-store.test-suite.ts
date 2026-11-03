import {
  ErrorCode,
  MAX_THREADS_PER_USER,
  type DurableStoreAdapter,
} from '@basebot/core';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';

import type { MessageCacheBackfillStore } from './cache-backfill-store.js';

export interface DurableStoreTestContext {
  adapter: DurableStoreAdapter;
  reset: () => Promise<void>;
}

/** Shared integration tests for Postgres and Mongo durable adapters. */
export function registerDurableStoreAdapterTests(
  getContext: () => DurableStoreTestContext,
): void {
  it('creates and retrieves threads', async () => {
    const { adapter } = getContext();
    const userId = `usr_${randomUUID()}`;
    const thread = await adapter.createThread(userId);
    expect(thread.user_id).toBe(userId);
    expect(thread.status).toBe('active');

    const fetched = await adapter.getThread(thread.id);
    expect(fetched?.id).toBe(thread.id);
  });

  it('enforces 5-thread limit per user', async () => {
    const { adapter } = getContext();
    const userId = `usr_${randomUUID()}`;
    for (let i = 0; i < MAX_THREADS_PER_USER; i++) {
      await adapter.createThread(userId);
    }

    await expect(adapter.createThread(userId)).rejects.toMatchObject({
      code: ErrorCode.THREAD_LIMIT_EXCEEDED,
    });
  });

  it('inserts messages and paginates history', async () => {
    const { adapter } = getContext();
    const userId = `usr_${randomUUID()}`;
    const thread = await adapter.createThread(userId);

    for (let i = 0; i < 3; i++) {
      await adapter.insertMessage({
        id: randomUUID(),
        thread_id: thread.id,
        user_id: userId,
        role: 'user',
        content: `message ${i}`,
        metadata: {},
      });
    }

    const page = await adapter.listMessages(thread.id, null, 2);
    expect(page.messages).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();

    const page2 = await adapter.listMessages(thread.id, page.nextCursor, 2);
    expect(page2.messages).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
  });

  it('loads messages for Redis cache backfill', async () => {
    const { adapter } = getContext();
    const backfillStore = adapter as MessageCacheBackfillStore;
    if (typeof backfillStore.getRecentMessages !== 'function') {
      return;
    }

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

    const recent = await backfillStore.getRecentMessages(thread.id, 8);
    expect(recent).toHaveLength(8);
    expect(recent[0]?.content).toBe('msg 2');
    expect(recent[7]?.content).toBe('msg 9');
  });
}
