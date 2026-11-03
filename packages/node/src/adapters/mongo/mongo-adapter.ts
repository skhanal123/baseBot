import {
  BaseBotError,
  ErrorCode,
  MAX_THREADS_PER_USER,
  type DurableStoreAdapter,
  type Message,
  type Thread,
} from '@basebot/core';
import { randomUUID } from 'node:crypto';
import type { Db, MongoClient } from 'mongodb';

import { ensureMongoIndexes } from './ensure-indexes.js';

interface ThreadDoc {
  id: string;
  user_id: string;
  created_at: Date;
  last_message_at: Date;
  archived_at: Date | null;
  status: 'active' | 'archived';
}

interface MessageDoc {
  id: string;
  thread_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

function mapThread(doc: ThreadDoc): Thread {
  return {
    id: doc.id,
    user_id: doc.user_id,
    created_at: doc.created_at,
    last_message_at: doc.last_message_at,
    archived_at: doc.archived_at,
    status: doc.status,
  };
}

function mapMessage(doc: MessageDoc): Message {
  return {
    id: doc.id,
    thread_id: doc.thread_id,
    user_id: doc.user_id,
    role: doc.role,
    content: doc.content,
    timestamp: doc.timestamp,
    metadata: doc.metadata ?? {},
  };
}

export interface MongoAdapterOptions {
  client: MongoClient;
  /** Database name (default: `basebot`). */
  dbName?: string;
  /** When true (default), ensure indexes on first use. */
  ensureIndexes?: boolean;
}

export class MongoAdapter implements DurableStoreAdapter {
  private readonly db: Db;
  private readonly ensureIndexesOnUse: boolean;
  private indexesReady: Promise<void> | null = null;

  constructor(options: MongoAdapterOptions) {
    this.db = options.client.db(options.dbName ?? 'basebot');
    this.ensureIndexesOnUse = options.ensureIndexes !== false;
  }

  private async ready(): Promise<void> {
    if (!this.ensureIndexesOnUse) {
      return;
    }
    if (!this.indexesReady) {
      this.indexesReady = ensureMongoIndexes(this.db);
    }
    await this.indexesReady;
  }

  async createThread(userId: string): Promise<Thread> {
    await this.ready();

    const count = await this.countNonArchivedThreads(userId);
    if (count >= MAX_THREADS_PER_USER) {
      throw new BaseBotError(
        ErrorCode.THREAD_LIMIT_EXCEEDED,
        `User exceeds maximum of ${String(MAX_THREADS_PER_USER)} non-archived threads`,
      );
    }

    const now = new Date();
    const doc: ThreadDoc = {
      id: randomUUID(),
      user_id: userId,
      created_at: now,
      last_message_at: now,
      archived_at: null,
      status: 'active',
    };

    await this.db.collection<ThreadDoc>('threads').insertOne(doc);
    return mapThread(doc);
  }

  async listThreads(userId: string, limit = 50): Promise<Thread[]> {
    await this.ready();

    const docs = await this.db
      .collection<ThreadDoc>('threads')
      .find({ user_id: userId, status: { $ne: 'archived' } })
      .sort({ last_message_at: -1 })
      .limit(limit)
      .toArray();

    return docs.map(mapThread);
  }

  async countNonArchivedThreads(userId: string): Promise<number> {
    await this.ready();

    return this.db.collection<ThreadDoc>('threads').countDocuments({
      user_id: userId,
      status: { $ne: 'archived' },
    });
  }

  async getThread(threadId: string): Promise<Thread | null> {
    await this.ready();

    const doc = await this.db.collection<ThreadDoc>('threads').findOne({ id: threadId });
    return doc ? mapThread(doc) : null;
  }

  async insertMessage(
    message: Omit<Message, 'timestamp'> & { timestamp?: Date },
  ): Promise<Message> {
    await this.ready();

    const timestamp = message.timestamp ?? new Date();
    const doc: MessageDoc = {
      id: message.id,
      thread_id: message.thread_id,
      user_id: message.user_id,
      role: message.role,
      content: message.content,
      timestamp,
      metadata: message.metadata ?? {},
    };

    await this.db.collection<MessageDoc>('messages').insertOne(doc);
    await this.updateThreadLastMessageAt(message.thread_id, timestamp);
    return mapMessage(doc);
  }

  async listMessages(
    threadId: string,
    cursor: string | null,
    pageSize: number,
  ): Promise<{ messages: Message[]; nextCursor: string | null }> {
    await this.ready();

    let filter: { thread_id: string; timestamp?: { $lt: Date } } = { thread_id: threadId };

    if (cursor) {
      const cursorDoc = await this.db.collection<MessageDoc>('messages').findOne({
        id: cursor,
        thread_id: threadId,
      });
      if (!cursorDoc) {
        return { messages: [], nextCursor: null };
      }
      filter = { thread_id: threadId, timestamp: { $lt: cursorDoc.timestamp } };
    }

    const docs = await this.db
      .collection<MessageDoc>('messages')
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(pageSize + 1)
      .toArray();

    const hasMore = docs.length > pageSize;
    const page = hasMore ? docs.slice(0, pageSize) : docs;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    return {
      messages: page.map(mapMessage),
      nextCursor,
    };
  }

  async updateThreadLastMessageAt(threadId: string, timestamp: Date): Promise<void> {
    await this.ready();

    await this.db
      .collection<ThreadDoc>('threads')
      .updateOne({ id: threadId }, { $set: { last_message_at: timestamp } });
  }

  /** Load the most recent N messages for cache backfill (oldest first). */
  async getRecentMessages(threadId: string, limit: number): Promise<Message[]> {
    await this.ready();

    const docs = await this.db
      .collection<MessageDoc>('messages')
      .find({ thread_id: threadId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();

    return docs.reverse().map(mapMessage);
  }
}

export function createMongoAdapter(client: MongoClient, dbName?: string): MongoAdapter {
  return dbName !== undefined
    ? new MongoAdapter({ client, dbName })
    : new MongoAdapter({ client });
}
