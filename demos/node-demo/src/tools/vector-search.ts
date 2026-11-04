import type { ToolDefinition, ToolInvocationRequest } from '@basebot/core';
import type { Db } from 'mongodb';
import type { InProcessToolHandler } from '@basebot/node';
import type { Pool } from 'pg';

import { createOpenAiEmbeddingClient } from '../seed/embeddings.js';
import { requireToolScope } from './scoping.js';
import {
  createMongoVectorStore,
  createPostgresVectorStore,
  type VectorKnowledgeStore,
} from './stores/vector-store.js';

export function createVectorSearchToolDefinition(handler: string): ToolDefinition {
  return {
    name: 'search_support_manual',
    description:
      'Semantic search over the technical support manual (cellular service, mobile data, MMS troubleshooting).',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        top_k: { type: 'number', description: 'Default 3, max 8' },
      },
      required: ['query'],
    },
    handler,
    timeoutMs: 25000,
  };
}

export async function runVectorSearchTool(
  request: ToolInvocationRequest,
  store: VectorKnowledgeStore,
): Promise<unknown> {
  const { user_id, thread_id } = requireToolScope(request.context);
  const queryArg = request.arguments.query;
  const query = typeof queryArg === 'string' ? queryArg.trim() : '';
  if (!query) throw new Error('query is required');

  const topKRaw = request.arguments.top_k;
  let top_k = typeof topKRaw === 'number' && Number.isFinite(topKRaw) ? topKRaw : 3;
  top_k = Math.min(8, Math.max(1, Math.floor(top_k)));

  const { hits } = await store.search({ user_id, thread_id, query, top_k });
  return { user_id, thread_id, query, hits };
}

export function createVectorSearchInProcessHandler(store: VectorKnowledgeStore): InProcessToolHandler {
  return (request) => runVectorSearchTool(request, store);
}

export function createVectorStoreFromBackend(backend: {
  kind: 'postgres' | 'mongo';
  pool?: Pool;
  mongoDb?: Db;
  openaiApiKey: string;
  embeddingModel?: string;
}): VectorKnowledgeStore {
  const embeddingClient = createOpenAiEmbeddingClient(
    backend.openaiApiKey,
    backend.embeddingModel,
  );
  if (backend.kind === 'postgres') {
    if (!backend.pool) throw new Error('Postgres pool required');
    return createPostgresVectorStore(backend.pool, embeddingClient);
  }
  if (!backend.mongoDb) throw new Error('Mongo Db required');
  return createMongoVectorStore(backend.mongoDb, embeddingClient);
}
