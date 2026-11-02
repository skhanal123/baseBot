import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

import { bullmqConnection } from './connection.js';
import { TURN_QUEUE_NAME, type TurnJobData } from './types.js';

export function createTurnQueue(redis: Redis): Queue<TurnJobData, TurnJobData> {
  return new Queue<TurnJobData, TurnJobData>(TURN_QUEUE_NAME, {
    connection: bullmqConnection(redis),
    defaultJobOptions: {
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
}

export async function enqueueTurn(
  queue: Queue<TurnJobData, TurnJobData>,
  data: TurnJobData,
): Promise<void> {
  await queue.add(data.job_id, data, { jobId: data.job_id });
}
