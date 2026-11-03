import type { DurableStoreAdapter, Message } from '@basebot/core';

/** Durable store that can load thread messages to backfill the Redis message cache. */
export interface MessageCacheBackfillStore extends DurableStoreAdapter {
  getRecentMessages(threadId: string, limit: number): Promise<Message[]>;
}

export function asMessageCacheBackfillStore(
  store: DurableStoreAdapter,
): MessageCacheBackfillStore | null {
  const candidate = store as MessageCacheBackfillStore;
  if (typeof candidate.getRecentMessages === 'function') {
    return candidate;
  }
  return null;
}
