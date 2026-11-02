import { BaseBotError, ErrorCode, type DurableStoreAdapter } from '@basebot/core';

export async function assertThreadAccess(
  store: DurableStoreAdapter,
  threadId: string,
  userId: string,
  correlationId?: string,
): Promise<void> {
  const thread = await store.getThread(threadId);
  if (!thread || thread.user_id !== userId) {
    throw new BaseBotError(
      ErrorCode.THREAD_ACCESS_DENIED,
      'Thread not found or access denied',
      correlationId,
    );
  }
}
