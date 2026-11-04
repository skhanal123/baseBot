import type { DurableStoreAdapter } from '@basebot/core';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

import type { TurnJobData } from '../queue/types.js';
import type { WorkerHandle } from '../queue/worker.js';

export interface ReadinessChecks {
  redis: boolean;
  database: boolean;
  worker: boolean;
}

export type ReadinessStatus = 'ok' | 'degraded';

export function readinessStatus(checks: ReadinessChecks): ReadinessStatus {
  return checks.redis && checks.database && checks.worker ? 'ok' : 'degraded';
}

export async function probeRedis(redis: Redis): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

export async function probeDatabase(store: DurableStoreAdapter): Promise<boolean> {
  try {
    await store.getThread('00000000-0000-0000-0000-000000000000');
    return true;
  } catch {
    return false;
  }
}

export async function probeWorker(
  queue: Queue<TurnJobData, TurnJobData>,
  worker: WorkerHandle | null,
): Promise<boolean> {
  try {
    if (worker) {
      return worker.isHealthy();
    }
    const count = await queue.getWorkersCount();
    return count > 0;
  } catch {
    return false;
  }
}

export async function collectReadinessChecks(
  redis: Redis,
  store: DurableStoreAdapter,
  queue: Queue<TurnJobData, TurnJobData>,
  worker: WorkerHandle | null,
): Promise<ReadinessChecks> {
  const [redisOk, databaseOk, workerOk] = await Promise.all([
    probeRedis(redis),
    probeDatabase(store),
    probeWorker(queue, worker),
  ]);

  return {
    redis: redisOk,
    database: databaseOk,
    worker: workerOk,
  };
}
