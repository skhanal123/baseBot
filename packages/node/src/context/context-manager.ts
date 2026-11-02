import type { DurableStoreAdapter, Message, MessageCacheAdapter } from '@basebot/core';

import type { PostgresAdapter } from '../adapters/postgres/postgres-adapter.js';

export interface ContextManagerOptions {
  store: DurableStoreAdapter;
  cache: MessageCacheAdapter;
  messageLimit: number;
}

export class ContextManager {
  private readonly store: DurableStoreAdapter;
  private readonly cache: MessageCacheAdapter;
  private readonly messageLimit: number;

  constructor(options: ContextManagerOptions) {
    this.store = options.store;
    this.cache = options.cache;
    this.messageLimit = options.messageLimit;
  }

  /**
   * Load last N messages for a thread. Redis-first with DB backfill on cache miss.
   * Never crosses thread boundary — scoped by threadId only.
   */
  async loadContext(threadId: string): Promise<Message[]> {
    const cached = await this.cache.getMessages(threadId);
    const hasCache =
      cached.length > 0 ||
      (await this.cacheHasKey(threadId));

    if (hasCache) {
      return cached;
    }

    const postgres = this.store as PostgresAdapter;
    if (typeof postgres.getRecentMessages !== 'function') {
      return [];
    }

    const fromDb = await postgres.getRecentMessages(threadId, this.messageLimit);
    if (fromDb.length > 0) {
      await this.cache.setMessages(threadId, fromDb);
    }
    return fromDb;
  }

  private async cacheHasKey(threadId: string): Promise<boolean> {
    const cacheWithProbe = this.cache as MessageCacheAdapter & {
      hasCache?: (id: string) => Promise<boolean>;
    };
    if (typeof cacheWithProbe.hasCache === 'function') {
      return cacheWithProbe.hasCache(threadId);
    }
    return false;
  }
}
