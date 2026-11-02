import type { StreamEvent } from '@basebot/core';
import type { Redis } from 'ioredis';

const JOB_EVENTS_PREFIX = 'job';
const JOB_EVENTS_SUFFIX = 'events';
const JOB_BUFFER_SUFFIX = 'buffer';

/** Buffer TTL aligned with stream token lifetime (15 min). */
const JOB_BUFFER_TTL_SECONDS = 900;

export function jobEventsChannel(jobId: string): string {
  return `${JOB_EVENTS_PREFIX}:${jobId}:${JOB_EVENTS_SUFFIX}`;
}

export function jobEventsBufferKey(jobId: string): string {
  return `${JOB_EVENTS_PREFIX}:${jobId}:${JOB_BUFFER_SUFFIX}`;
}

function parseEvent(raw: string): StreamEvent | null {
  try {
    return JSON.parse(raw) as StreamEvent;
  } catch {
    return null;
  }
}

function isTerminal(event: StreamEvent): boolean {
  return event.event === 'message.end' || event.event === 'error';
}

export class StreamEmitter {
  private readonly redis: Redis;
  private readonly subscriber: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
    this.subscriber = redis.duplicate();
  }

  async publish(jobId: string, event: StreamEvent): Promise<void> {
    const channel = jobEventsChannel(jobId);
    const bufferKey = jobEventsBufferKey(jobId);
    const serialized = JSON.stringify(event);

    const pipeline = this.redis.pipeline();
    pipeline.rpush(bufferKey, serialized);
    pipeline.expire(bufferKey, JOB_BUFFER_TTL_SECONDS);
    // Notify live subscribers to read new entries from the buffer.
    pipeline.publish(channel, '1');
    await pipeline.exec();
  }

  async subscribe(
    jobId: string,
    onEvent: (event: StreamEvent) => void,
  ): Promise<() => Promise<void>> {
    const channel = jobEventsChannel(jobId);
    const bufferKey = jobEventsBufferKey(jobId);
    let index = 0;
    let ended = false;

    const flush = async (): Promise<boolean> => {
      const raw = await this.redis.lrange(bufferKey, index, -1);
      for (const item of raw) {
        const event = parseEvent(item);
        if (!event) {
          index++;
          continue;
        }
        index++;
        onEvent(event);
        if (isTerminal(event)) {
          ended = true;
          return true;
        }
      }
      return ended;
    };

    /** Serialize flushes so concurrent pub/sub notifications cannot re-deliver the same buffer slice. */
    let flushChain: Promise<boolean> = Promise.resolve(false);
    const scheduleFlush = (): Promise<boolean> => {
      flushChain = flushChain.then(async () => {
        if (ended) {
          return true;
        }
        return flush();
      });
      return flushChain;
    };

    if (await scheduleFlush()) {
      return async () => {
        /* replay-only; nothing to unsubscribe */
      };
    }

    const handler = (ch: string) => {
      if (ch !== channel || ended) {
        return;
      }
      void scheduleFlush().then((done) => {
        if (done) {
          ended = true;
        }
      });
    };

    this.subscriber.on('message', handler);
    await this.subscriber.subscribe(channel);

    return async () => {
      this.subscriber.off('message', handler);
      await this.subscriber.unsubscribe(channel);
    };
  }

  async close(): Promise<void> {
    await this.subscriber.quit();
  }
}

export function formatSseEvent(event: StreamEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}
