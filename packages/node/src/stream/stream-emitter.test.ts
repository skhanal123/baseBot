import type { StreamEvent } from '@basebot/core';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { StreamEmitter, jobEventsBufferKey } from './stream-emitter.js';

const redisUrl = process.env.REDIS_URL;
const describeIntegration = redisUrl ? describe : describe.skip;

describeIntegration('StreamEmitter buffer replay', () => {
  const redis = new Redis(redisUrl as string, { maxRetriesPerRequest: null });
  const emitter = new StreamEmitter(redis);
  const jobId = `job_test_${Date.now()}`;

  beforeAll(async () => {
    await redis.del(jobEventsBufferKey(jobId));
  });

  afterAll(async () => {
    await redis.del(jobEventsBufferKey(jobId));
    await emitter.close();
    await redis.quit();
  });

  it('replays buffered events to late subscribers', async () => {
    const events: StreamEvent[] = [
      {
        event: 'message.start',
        data: { message_id: 'msg_1', thread_id: '550e8400-e29b-41d4-a716-446655440000' },
      },
      {
        event: 'message.delta',
        data: { message_id: 'msg_1', delta: 'Hi' },
      },
      {
        event: 'message.end',
        data: { message_id: 'msg_1', content: 'Hi there' },
      },
    ];

    for (const event of events) {
      await emitter.publish(jobId, event);
    }

    // Simulate delay before client connects (worker already finished).
    await new Promise((resolve) => setTimeout(resolve, 100));

    const received: StreamEvent[] = [];
    await emitter.subscribe(jobId, (event) => {
      received.push(event);
    });

    expect(received).toHaveLength(3);
    expect(received[2]?.event).toBe('message.end');
  });
 
  it('does not duplicate events when many publishes arrive concurrently', async () => {
    const concurrentJobId = `job_concurrent_${Date.now()}`;
    await redis.del(jobEventsBufferKey(concurrentJobId));

    const received: StreamEvent[] = [];
    await emitter.subscribe(concurrentJobId, (event) => {
      received.push(event);
    });

    await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        emitter.publish(concurrentJobId, {
          event: 'message.delta',
          data: { message_id: 'msg_1', delta: `d${String(i)} ` },
        }),
      ),
    );

    await emitter.publish(concurrentJobId, {
      event: 'message.end',
      data: { message_id: 'msg_1', content: 'done' },
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    const deltas = received.filter((e) => e.event === 'message.delta');
    expect(deltas).toHaveLength(40);

    await redis.del(jobEventsBufferKey(concurrentJobId));
  });
});
