import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify as yamlStringify } from 'yaml';
import { z } from 'zod';

import {
  CreateThreadRequestSchema,
  CreateThreadResponseSchema,
  ErrorResponseSchema,
  ListMessagesQuerySchema,
  ListMessagesResponseSchema,
  ListThreadsQuerySchema,
  ListThreadsResponseSchema,
  SendMessageRequestSchema,
  SendMessageResponseSchema,
} from '../schemas/api.js';

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

registry.register('ErrorResponse', ErrorResponseSchema);

const errorResponses = {
  400: {
    description: 'Validation error',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  401: {
    description: 'Stream token invalid or expired',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  403: {
    description: 'Thread access denied',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  409: {
    description: 'Thread limit exceeded',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  422: {
    description: 'Hook rejected',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  500: {
    description: 'Internal error',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
} as const;

registry.registerPath({
  method: 'post',
  path: '/v1/threads',
  summary: 'Create thread',
  tags: ['Threads'],
  request: {
    body: {
      content: { 'application/json': { schema: CreateThreadRequestSchema } },
    },
  },
  responses: {
    201: {
      description: 'Thread created',
      content: { 'application/json': { schema: CreateThreadResponseSchema } },
    },
    ...errorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/v1/threads',
  summary: 'List threads by user',
  tags: ['Threads'],
  request: {
    query: ListThreadsQuerySchema,
  },
  responses: {
    200: {
      description: 'Thread list',
      content: { 'application/json': { schema: ListThreadsResponseSchema } },
    },
    ...errorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/v1/threads/{thread_id}/messages',
  summary: 'Send user message',
  tags: ['Messages'],
  request: {
    params: z.object({ thread_id: z.string().uuid() }),
    body: {
      content: { 'application/json': { schema: SendMessageRequestSchema } },
    },
  },
  responses: {
    202: {
      description: 'Message accepted for async processing',
      content: { 'application/json': { schema: SendMessageResponseSchema } },
    },
    ...errorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/v1/threads/{thread_id}/messages',
  summary: 'Paginated message history',
  tags: ['Messages'],
  request: {
    params: z.object({ thread_id: z.string().uuid() }),
    query: ListMessagesQuerySchema,
  },
  responses: {
    200: {
      description: 'Message history',
      content: { 'application/json': { schema: ListMessagesResponseSchema } },
    },
    ...errorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/v1/stream/{job_id}',
  summary: 'SSE stream for async job',
  tags: ['Stream'],
  request: {
    params: z.object({ job_id: z.string() }),
    query: z.object({
      token: z.string().describe('Signed stream token from 202 response'),
    }),
  },
  responses: {
    200: {
      description: 'Server-sent events stream',
      content: {
        'text/event-stream': {
          schema: z.string().describe('SSE events: message.start, message.delta, message.end, error'),
        },
      },
    },
    ...errorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/health',
  summary: 'Liveness probe',
  tags: ['Health'],
  responses: {
    200: {
      description: 'Service is alive',
      content: {
        'application/json': {
          schema: z.object({ status: z.literal('ok') }),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/health/ready',
  summary: 'Readiness probe (Redis + DB)',
  tags: ['Health'],
  responses: {
    200: {
      description: 'Dependencies healthy',
      content: {
        'application/json': {
          schema: z.object({
            status: z.literal('ok'),
            redis: z.boolean(),
            database: z.boolean(),
          }),
        },
      },
    },
    503: {
      description: 'One or more dependencies unavailable',
      content: {
        'application/json': {
          schema: z.object({
            status: z.literal('degraded'),
            redis: z.boolean(),
            database: z.boolean(),
          }),
        },
      },
    },
  },
});

const generator = new OpenApiGeneratorV3(registry.definitions);

const document = generator.generateDocument({
  openapi: '3.0.3',
  info: {
    title: 'baseBot API',
    version: '1.0.0',
    description:
      'Embeddable AI chat framework REST API. Generated from @basebot/core schemas.',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local development' }],
});

const outputPath = join(dirname(fileURLToPath(import.meta.url)), '../../../../docs/openapi.yaml');
writeFileSync(outputPath, yamlStringify(document), 'utf8');
console.log(`OpenAPI spec written to ${outputPath}`);
