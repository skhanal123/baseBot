import { describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';

import { createServer } from './create-server.js';

describe('createServer bootstrap validation', () => {
  it('throws when streamSigningSecret is missing', async () => {
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    await expect(
      createServer({
        store: {} as never,
        cache: {} as never,
        redis,
        streamSigningSecret: '',
        llm: { provider: 'mock', mockResponse: 'hi' },
        startWorker: false,
      }),
    ).rejects.toThrow(/streamSigningSecret/);
    await redis.quit();
  });

  it('throws when LLM config is missing', async () => {
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    await expect(
      createServer({
        store: {} as never,
        cache: {} as never,
        redis,
        streamSigningSecret: 'test-secret',
        startWorker: false,
      }),
    ).rejects.toThrow(/LLM config/);
    await redis.quit();
  });
});
