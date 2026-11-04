import type { ToolDefinition, ToolInvocationRequest } from '@basebot/core';
import type { InProcessToolHandler } from '@basebot/node';

import { requireToolScope } from './scoping.js';

export interface WebSearchOptions {
  serperApiKey: string;
  defaultResultCount?: number;
  fetchImpl?: typeof fetch;
  endpoint?: string;
}

export interface WebSearchResult {
  title: string;
  link: string;
  snippet: string;
}

export function createWebSearchToolDefinition(handler: string): ToolDefinition {
  return {
    name: 'web_search',
    description:
      'Search the public web when account data or the support manual are insufficient. Use a concise query.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        num_results: { type: 'number', description: 'Default 5, max 10' },
      },
      required: ['query'],
    },
    handler,
    timeoutMs: 20000,
    on_failure: 'empty_response',
    empty_response_text: 'Web search is unavailable.',
  };
}

export async function runWebSearchTool(
  request: ToolInvocationRequest,
  options: WebSearchOptions,
): Promise<{ query: string; results: WebSearchResult[]; user_id: string; thread_id: string }> {
  const { user_id, thread_id } = requireToolScope(request.context);
  const queryArg = request.arguments.query;
  const query = typeof queryArg === 'string' ? queryArg.trim() : '';
  if (!query) throw new Error('query is required');
  if (!options.serperApiKey) throw new Error('SERPER_API_KEY is not configured');

  const numRaw = request.arguments.num_results;
  let num =
    typeof numRaw === 'number' && Number.isFinite(numRaw) ? numRaw : (options.defaultResultCount ?? 5);
  num = Math.min(10, Math.max(1, Math.floor(num)));

  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(options.endpoint ?? 'https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': options.serperApiKey,
    },
    body: JSON.stringify({ q: query, num }),
  });

  if (!response.ok) {
    throw new Error(`Serper HTTP ${String(response.status)}`);
  }

  const body = (await response.json()) as {
    organic?: Array<{ title?: string; link?: string; snippet?: string }>;
  };

  const results = (body.organic ?? []).slice(0, num).map((row) => ({
    title: row.title ?? '',
    link: row.link ?? '',
    snippet: row.snippet ?? '',
  }));

  return { query, results, user_id, thread_id };
}

export function createWebSearchInProcessHandler(options: WebSearchOptions): InProcessToolHandler {
  return (request) => runWebSearchTool(request, options);
}
