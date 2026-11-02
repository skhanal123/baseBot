import {
  BaseBotError,
  ErrorCode,
  MAX_THREADS_PER_USER,
  type DurableStoreAdapter,
  type Message,
  type Thread,
} from '@basebot/core';
import { randomUUID } from 'node:crypto';
import type { PgPool } from './pg-pool.js';

interface ThreadRow {
  id: string;
  user_id: string;
  created_at: Date;
  last_message_at: Date;
  archived_at: Date | null;
  status: 'active' | 'archived';
}

interface MessageRow {
  id: string;
  thread_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

function mapThread(row: ThreadRow): Thread {
  return {
    id: row.id,
    user_id: row.user_id,
    created_at: row.created_at,
    last_message_at: row.last_message_at,
    archived_at: row.archived_at,
    status: row.status,
  };
}

function mapMessage(row: MessageRow): Message {
  return {
    id: row.id,
    thread_id: row.thread_id,
    user_id: row.user_id,
    role: row.role,
    content: row.content,
    timestamp: row.timestamp,
    metadata: row.metadata,
  };
}

export interface PostgresAdapterOptions {
  pool: PgPool;
}

export class PostgresAdapter implements DurableStoreAdapter {
  private readonly pool: PgPool;

  constructor(options: PostgresAdapterOptions) {
    this.pool = options.pool;
  }

  async createThread(userId: string): Promise<Thread> {
    const count = await this.countNonArchivedThreads(userId);
    if (count >= MAX_THREADS_PER_USER) {
      throw new BaseBotError(
        ErrorCode.THREAD_LIMIT_EXCEEDED,
        `User exceeds maximum of ${String(MAX_THREADS_PER_USER)} non-archived threads`,
      );
    }

    const id = randomUUID();
    const result = await this.pool.query<ThreadRow>(
      `INSERT INTO threads (id, user_id, status)
       VALUES ($1, $2, 'active')
       RETURNING id, user_id, created_at, last_message_at, archived_at, status`,
      [id, userId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new BaseBotError(ErrorCode.INTERNAL_ERROR, 'Failed to create thread');
    }
    return mapThread(row);
  }

  async listThreads(userId: string, limit = 50): Promise<Thread[]> {
    const result = await this.pool.query<ThreadRow>(
      `SELECT id, user_id, created_at, last_message_at, archived_at, status
       FROM threads
       WHERE user_id = $1 AND status != 'archived'
       ORDER BY last_message_at DESC
       LIMIT $2`,
      [userId, limit],
    );
    return result.rows.map(mapThread);
  }

  async countNonArchivedThreads(userId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM threads
       WHERE user_id = $1 AND status != 'archived'`,
      [userId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async getThread(threadId: string): Promise<Thread | null> {
    const result = await this.pool.query<ThreadRow>(
      `SELECT id, user_id, created_at, last_message_at, archived_at, status
       FROM threads
       WHERE id = $1`,
      [threadId],
    );
    const row = result.rows[0];
    return row ? mapThread(row) : null;
  }

  async insertMessage(
    message: Omit<Message, 'timestamp'> & { timestamp?: Date },
  ): Promise<Message> {
    const timestamp = message.timestamp ?? new Date();
    const result = await this.pool.query<MessageRow>(
      `INSERT INTO messages (id, thread_id, user_id, role, content, timestamp, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING id, thread_id, user_id, role, content, timestamp, metadata`,
      [
        message.id,
        message.thread_id,
        message.user_id,
        message.role,
        message.content,
        timestamp,
        JSON.stringify(message.metadata),
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new BaseBotError(ErrorCode.INTERNAL_ERROR, 'Failed to insert message');
    }

    await this.updateThreadLastMessageAt(message.thread_id, timestamp);
    return mapMessage(row);
  }

  async listMessages(
    threadId: string,
    cursor: string | null,
    pageSize: number,
  ): Promise<{ messages: Message[]; nextCursor: string | null }> {
    let rows: MessageRow[];

    if (cursor) {
      const cursorResult = await this.pool.query<{ timestamp: Date }>(
        'SELECT timestamp FROM messages WHERE id = $1 AND thread_id = $2',
        [cursor, threadId],
      );
      const cursorTimestamp = cursorResult.rows[0]?.timestamp;
      if (!cursorTimestamp) {
        return { messages: [], nextCursor: null };
      }

      const result = await this.pool.query<MessageRow>(
        `SELECT id, thread_id, user_id, role, content, timestamp, metadata
         FROM messages
         WHERE thread_id = $1
           AND timestamp < $2
         ORDER BY timestamp DESC
         LIMIT $3`,
        [threadId, cursorTimestamp, pageSize + 1],
      );
      rows = result.rows;
    } else {
      const result = await this.pool.query<MessageRow>(
        `SELECT id, thread_id, user_id, role, content, timestamp, metadata
         FROM messages
         WHERE thread_id = $1
         ORDER BY timestamp DESC
         LIMIT $2`,
        [threadId, pageSize + 1],
      );
      rows = result.rows;
    }

    const hasMore = rows.length > pageSize;
    const page = hasMore ? rows.slice(0, pageSize) : rows;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    return {
      messages: page.map(mapMessage),
      nextCursor,
    };
  }

  async updateThreadLastMessageAt(threadId: string, timestamp: Date): Promise<void> {
    await this.pool.query('UPDATE threads SET last_message_at = $1 WHERE id = $2', [
      timestamp,
      threadId,
    ]);
  }

  /** Load the most recent N messages for cache backfill (oldest first). */
  async getRecentMessages(threadId: string, limit: number): Promise<Message[]> {
    const result = await this.pool.query<MessageRow>(
      `SELECT id, thread_id, user_id, role, content, timestamp, metadata
       FROM (
         SELECT id, thread_id, user_id, role, content, timestamp, metadata
         FROM messages
         WHERE thread_id = $1
         ORDER BY timestamp DESC
         LIMIT $2
       ) recent
       ORDER BY timestamp ASC`,
      [threadId, limit],
    );
    return result.rows.map(mapMessage);
  }
}

export function createPostgresAdapter(pool: PgPool): PostgresAdapter {
  return new PostgresAdapter({ pool });
}
