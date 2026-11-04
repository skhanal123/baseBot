/**
 * US-8 / US-17: every demo tool handler must scope data access using framework-injected
 * `user_id` and `thread_id`. The framework does not rewrite SQL — handlers and stores enforce
 * isolation (see `stores/telecom-db-store.ts` for Postgres/Mongo filter examples).
 */
import type { ToolInvocationContext } from '@basebot/core';

export function requireToolScope(context: ToolInvocationContext): {
  user_id: string;
  thread_id: string;
} {
  const user_id = context.user_id?.trim();
  const thread_id = context.thread_id?.trim();
  if (!user_id || !thread_id) {
    throw new Error('Tool context missing user_id or thread_id');
  }
  return { user_id, thread_id };
}
