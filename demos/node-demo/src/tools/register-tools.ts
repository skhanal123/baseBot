import type { ToolDefinition, ToolInvocationRequest } from '@basebot/core';
import type { InProcessToolHandler, ServerToolRegistration } from '@basebot/node';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { createDbQueryInProcessHandler, createDbQueryToolDefinition, createTelecomDbStoreFromBackend } from './db-query.js';
import {
  createVectorSearchInProcessHandler,
  createVectorSearchToolDefinition,
  createVectorStoreFromBackend,
} from './vector-search.js';
import {
  createWebSearchInProcessHandler,
  createWebSearchToolDefinition,
  type WebSearchOptions,
} from './web-search.js';
import type { TelecomToolBackend } from './telecom-backend.js';

export interface RegisterTelecomToolsOptions {
  backend: TelecomToolBackend;
  mode?: 'inprocess' | 'http';
  httpBaseUrl?: string;
}

export type ToolRegistrar = (definition: ToolDefinition, handler?: InProcessToolHandler) => void;

function createHandlers(backend: TelecomToolBackend): {
  dbQuery: InProcessToolHandler;
  vectorSearch: InProcessToolHandler;
  webSearch: InProcessToolHandler;
} {
  const telecomStore = createTelecomDbStoreFromBackend(backend);
  const vectorStore = createVectorStoreFromBackend(backend);
  const webSearchOptions: WebSearchOptions = {
    serperApiKey: backend.serperApiKey ?? process.env.SERPER_API_KEY ?? '',
  };

  return {
    dbQuery: createDbQueryInProcessHandler(telecomStore),
    vectorSearch: createVectorSearchInProcessHandler(vectorStore),
    webSearch: createWebSearchInProcessHandler(webSearchOptions),
  };
}

export function getTelecomToolRegistrations(
  options: RegisterTelecomToolsOptions,
): ServerToolRegistration[] {
  const mode = options.mode ?? 'inprocess';
  const base = options.httpBaseUrl?.replace(/\/$/, '');

  const handlerFor = (path: string, inProcessRef: string): string => {
    if (mode === 'http') {
      if (!base) throw new Error('httpBaseUrl required for http mode');
      return `${base}${path}`;
    }
    return inProcessRef;
  };

  const definitions = [
    createDbQueryToolDefinition(
      handlerFor('/internal/tools/db-query', 'inprocess:search_telecom_database'),
    ),
    createVectorSearchToolDefinition(
      handlerFor('/internal/tools/vector-search', 'inprocess:search_support_manual'),
    ),
    createWebSearchToolDefinition(handlerFor('/internal/tools/web-search', 'inprocess:web_search')),
  ];

  if (mode === 'http') {
    return definitions.map((definition) => ({ definition }));
  }

  const handlers = createHandlers(options.backend);
  return [
    { definition: definitions[0]!, handler: handlers.dbQuery },
    { definition: definitions[1]!, handler: handlers.vectorSearch },
    { definition: definitions[2]!, handler: handlers.webSearch },
  ];
}

export function registerTelecomTools(
  register: ToolRegistrar,
  options: RegisterTelecomToolsOptions,
): void {
  for (const entry of getTelecomToolRegistrations(options)) {
    register(entry.definition, entry.handler);
  }
}

export function registerTelecomToolHttpRoutes(
  app: FastifyInstance,
  options: RegisterTelecomToolsOptions,
): void {
  const handlers = createHandlers(options.backend);
  app.post('/internal/tools/db-query', async (request: FastifyRequest) =>
    handlers.dbQuery(request.body as ToolInvocationRequest),
  );
  app.post('/internal/tools/vector-search', async (request: FastifyRequest) =>
    handlers.vectorSearch(request.body as ToolInvocationRequest),
  );
  app.post('/internal/tools/web-search', async (request: FastifyRequest) =>
    handlers.webSearch(request.body as ToolInvocationRequest),
  );
}
