import type { Db } from 'mongodb';

const INDEXES_APPLIED = Symbol('basebotMongoIndexesApplied');

type DbWithMarker = Db & { [INDEXES_APPLIED]?: boolean };

/** Create MongoDB indexes matching Postgres query patterns (idempotent). */
export async function ensureMongoIndexes(db: Db): Promise<void> {
  const marked = db as DbWithMarker;
  if (marked[INDEXES_APPLIED]) {
    return;
  }

  await db.collection('threads').createIndexes([
    { key: { user_id: 1, last_message_at: -1 } },
    { key: { user_id: 1, status: 1 } },
  ]);

  await db.collection('messages').createIndexes([
    { key: { thread_id: 1, timestamp: -1 } },
    { key: { user_id: 1 } },
    { key: { id: 1, thread_id: 1 } },
  ]);

  marked[INDEXES_APPLIED] = true;
}
