import type { Db } from 'mongodb';

import { EMBEDDING_DIMENSIONS } from './pg-vector.js';

export const MONGO_VECTOR_INDEX = 'knowledge_embedding_index';

/** Atlas / mongot vector search index for knowledge_chunks.embedding */
export async function ensureMongoVectorSearchIndex(db: Db): Promise<void> {
  const collection = db.collection('knowledge_chunks');
  const existing = await collection.listSearchIndexes().toArray();
  if (existing.some((idx) => idx.name === MONGO_VECTOR_INDEX)) {
    return;
  }

  await collection.createSearchIndex({
    name: MONGO_VECTOR_INDEX,
    definition: {
      mappings: {
        dynamic: false,
        fields: {
          source: { type: 'token' },
          embedding: {
            type: 'knnVector',
            dimensions: EMBEDDING_DIMENSIONS,
            similarity: 'cosine',
          },
        },
      },
    },
  });
}
