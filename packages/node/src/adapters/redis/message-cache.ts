import { DEFAULT_CONFIG, type Message, type MessageCacheAdapter } from '@basebot/core';
import { Redis } from 'ioredis';

export interface RedisMessageCacheOptions {
  redis: Redis;
  /** Max messages per thread list. Default: 8 */
  messageLimit?: number;
  /** Sliding TTL in seconds. Default: 86400 */
  ttlSeconds?: number;
  /** Key prefix. Default: thread */
  keyPrefix?: string;
}

function cacheKey(prefix: string, threadId: string): string {
  return `${prefix}:${threadId}:messages`;
}

function serializeMessage(message: Message): string {
  return JSON.stringify({
    id: message.id,
    thread_id: message.thread_id,
    user_id: message.user_id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp.toISOString(),
    metadata: message.metadata,
  });
}

function deserializeMessage(raw: string): Message {
  const parsed = JSON.parse(raw) as {
    id: string;
    thread_id: string;
    user_id: string;
    role: Message['role'];
    content: string;
    timestamp: string;
    metadata: Record<string, unknown>;
  };
  return {
    id: parsed.id,
    thread_id: parsed.thread_id,
    user_id: parsed.user_id,
    role: parsed.role,
    content: parsed.content,
    timestamp: new Date(parsed.timestamp),
    metadata: parsed.metadata,
  };
}

export class RedisMessageCache implements MessageCacheAdapter {
  private readonly redis: Redis;
  private readonly messageLimit: number;
  private readonly ttlSeconds: number;
  private readonly keyPrefix: string;

  constructor(options: RedisMessageCacheOptions) {
    this.redis = options.redis;
    this.messageLimit = options.messageLimit ?? DEFAULT_CONFIG.cache.messageLimit;
    this.ttlSeconds = options.ttlSeconds ?? DEFAULT_CONFIG.cache.ttlSeconds;
    this.keyPrefix = options.keyPrefix ?? 'thread';
  }

  private key(threadId: string): string {
    return cacheKey(this.keyPrefix, threadId);
  }

  async appendMessage(threadId: string, message: Message): Promise<void> {
    const key = this.key(threadId);
    const pipeline = this.redis.pipeline();
    pipeline.rpush(key, serializeMessage(message));
    pipeline.ltrim(key, -this.messageLimit, -1);
    pipeline.expire(key, this.ttlSeconds);
    await pipeline.exec();
  }

  async getMessages(threadId: string): Promise<Message[]> {
    const key = this.key(threadId);
    const exists = await this.redis.exists(key);
    if (exists === 0) {
      return [];
    }

    const raw = await this.redis.lrange(key, 0, -1);
    return raw.map(deserializeMessage);
  }

  async setMessages(threadId: string, messages: Message[]): Promise<void> {
    const key = this.key(threadId);
    const trimmed = messages.slice(-this.messageLimit);

    const pipeline = this.redis.pipeline();
    pipeline.del(key);
    if (trimmed.length > 0) {
      for (const message of trimmed) {
        pipeline.rpush(key, serializeMessage(message));
      }
    }
    pipeline.expire(key, this.ttlSeconds);
    await pipeline.exec();
  }

  async purge(threadId: string): Promise<void> {
    await this.redis.del(this.key(threadId));
  }

  /** Returns true when the cache key exists (may be empty list after trim). */
  async hasCache(threadId: string): Promise<boolean> {
    return (await this.redis.exists(this.key(threadId))) === 1;
  }

  /** Refresh TTL without modifying messages (sliding window). */
  async refreshTtl(threadId: string): Promise<void> {
    await this.redis.expire(this.key(threadId), this.ttlSeconds);
  }
}

export function createRedisMessageCache(
  redis: Redis,
  options?: Omit<RedisMessageCacheOptions, 'redis'>,
): RedisMessageCache {
  return new RedisMessageCache({ redis, ...options });
}

export { cacheKey, deserializeMessage, serializeMessage };
