import type { Message } from './message.js';
import type { Thread } from './thread.js';

/**
 * Durable store adapter interface.
 * Implemented by Postgres (MVP) and Mongo (v1.0) adapters.
 */
export interface DurableStoreAdapter {
  createThread(userId: string): Promise<Thread>;
  listThreads(userId: string, limit?: number): Promise<Thread[]>;
  countNonArchivedThreads(userId: string): Promise<number>;
  getThread(threadId: string): Promise<Thread | null>;
  insertMessage(message: Omit<Message, 'timestamp'> & { timestamp?: Date }): Promise<Message>;
  listMessages(
    threadId: string,
    cursor: string | null,
    pageSize: number,
  ): Promise<{ messages: Message[]; nextCursor: string | null }>;
  updateThreadLastMessageAt(threadId: string, timestamp: Date): Promise<void>;
}

export interface InsertMessageInput {
  id: string;
  thread_id: string;
  user_id: string;
  role: Message['role'];
  content: string;
  metadata?: Record<string, unknown>;
}

export interface MessageCacheAdapter {
  /** Append message and trim list to limit; refresh TTL. */
  appendMessage(threadId: string, message: Message): Promise<void>;
  /** Get cached messages (newest last). Returns empty array on cache miss. */
  getMessages(threadId: string): Promise<Message[]>;
  /** Replace entire cache from DB backfill. */
  setMessages(threadId: string, messages: Message[]): Promise<void>;
  /** Remove cache key for a thread. */
  purge(threadId: string): Promise<void>;
}
