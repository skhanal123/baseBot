import { describe, expect, it } from 'vitest';

import { cacheKey, deserializeMessage, serializeMessage } from './message-cache.js';
import type { Message } from '@basebot/core';

describe('RedisMessageCache serialization', () => {
  const message: Message = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    thread_id: '660e8400-e29b-41d4-a716-446655440001',
    user_id: 'usr_abc',
    role: 'user',
    content: 'hello',
    timestamp: new Date('2026-06-06T10:00:00.000Z'),
    metadata: { key: 'value' },
  };

  it('round-trips message JSON', () => {
    const raw = serializeMessage(message);
    const restored = deserializeMessage(raw);
    expect(restored.id).toBe(message.id);
    expect(restored.content).toBe(message.content);
    expect(restored.timestamp.toISOString()).toBe(message.timestamp.toISOString());
    expect(restored.metadata).toEqual(message.metadata);
  });

  it('builds cache key per TDD pattern', () => {
    expect(cacheKey('thread', 'thr_123')).toBe('thread:thr_123:messages');
  });
});
