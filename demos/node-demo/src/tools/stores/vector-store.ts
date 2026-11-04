import type { Db } from 'mongodb';
import type { Pool } from 'pg';

import type { EmbeddingClient } from '../../seed/embeddings.js';
import { MONGO_VECTOR_INDEX } from '../../seed/mongo-vector-index.js';
import { TECH_SUPPORT_SOURCE } from '../../seed/seed.js';
import { toPgVector } from '../../seed/pg-vector.js';

export interface VectorHit {
  id: string;
  section: string | null;
  content: string;
  score: number;
}

export interface VectorKnowledgeStore {
  search(params: {
    user_id: string;
    thread_id: string;
    query: string;
    top_k: number;
  }): Promise<{ hits: VectorHit[] }>;
}

export function createPostgresVectorStore(
  pool: Pool,
  embeddingClient: EmbeddingClient,
  source = TECH_SUPPORT_SOURCE,
): VectorKnowledgeStore {
  return {
    async search({ query, top_k }) {
      const [queryEmbedding] = await embeddingClient.embedTexts([query]);
      if (!queryEmbedding) {
        return { hits: [] };
      }

      const result = await pool.query<{
        id: string;
        section: string | null;
        content: string;
        score: number;
      }>(
        `SELECT id::text,
                section,
                content,
                1 - (embedding <=> $1::vector) AS score
         FROM knowledge_chunks
         WHERE source = $2
         ORDER BY embedding <=> $1::vector
         LIMIT $3`,
        [toPgVector(queryEmbedding), source, top_k],
      );

      return {
        hits: result.rows.map((row) => ({
          id: row.id,
          section: row.section,
          content: row.content,
          score: row.score,
        })),
      };
    },
  };
}

export function createMongoVectorStore(
  db: Db,
  embeddingClient: EmbeddingClient,
  source = TECH_SUPPORT_SOURCE,
): VectorKnowledgeStore {
  return {
    async search({ query, top_k }) {
      const [queryEmbedding] = await embeddingClient.embedTexts([query]);
      if (!queryEmbedding) {
        return { hits: [] };
      }

      const rows = await db
        .collection('knowledge_chunks')
        .aggregate<{
          _id: unknown;
          section?: string;
          content: string;
          score: number;
        }>([
          {
            $vectorSearch: {
              index: MONGO_VECTOR_INDEX,
              path: 'embedding',
              queryVector: queryEmbedding,
              numCandidates: Math.max(50, top_k * 10),
              limit: top_k,
              filter: { source: { $eq: source } },
            },
          },
          {
            $project: {
              section: 1,
              content: 1,
              score: { $meta: 'vectorSearchScore' },
            },
          },
        ])
        .toArray();

      return {
        hits: rows.map((row) => ({
          id: String(row._id),
          section: row.section ?? null,
          content: row.content,
          score: row.score,
        })),
      };
    },
  };
}
