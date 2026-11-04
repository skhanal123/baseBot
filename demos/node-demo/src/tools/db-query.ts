import type { ToolDefinition, ToolInvocationRequest } from '@basebot/core';
import type { Db } from 'mongodb';
import type { InProcessToolHandler } from '@basebot/node';
import type { Pool } from 'pg';

import { requireToolScope } from './scoping.js';
import {
  createMongoTelecomDbStore,
  createPostgresTelecomDbStore,
  type TelecomDbQuery,
  type TelecomDbStore,
  type TelecomEntity,
} from './stores/telecom-db-store.js';

export function createDbQueryToolDefinition(handler: string): ToolDefinition {
  return {
    name: 'search_telecom_database',
    description:
      'Query telecom account data (customer profile, lines, bills, devices, plan catalog). Scoped to the chat user via demo_user_customer_map.',
    parameters: {
      type: 'object',
      properties: {
        entity: {
          type: 'string',
          enum: ['customer_profile', 'lines', 'bills', 'plans', 'devices'],
        },
        line_id: { type: 'string' },
        bill_id: { type: 'string' },
        phone_number: { type: 'string' },
        plan_id: { type: 'string' },
        device_id: { type: 'string' },
      },
      required: ['entity'],
    },
    handler,
    timeoutMs: 15000,
  };
}

function parseTelecomQuery(args: Record<string, unknown>): TelecomDbQuery {
  const entity = args.entity;
  if (
    entity !== 'customer_profile' &&
    entity !== 'lines' &&
    entity !== 'bills' &&
    entity !== 'plans' &&
    entity !== 'devices'
  ) {
    throw new Error('entity must be customer_profile, lines, bills, plans, or devices');
  }

  const optionalString = (key: string): string | undefined => {
    const value = args[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  };

  const query: TelecomDbQuery = { entity: entity as TelecomEntity };
  const line_id = optionalString('line_id');
  const bill_id = optionalString('bill_id');
  const phone_number = optionalString('phone_number');
  const plan_id = optionalString('plan_id');
  const device_id = optionalString('device_id');
  if (line_id) query.line_id = line_id;
  if (bill_id) query.bill_id = bill_id;
  if (phone_number) query.phone_number = phone_number;
  if (plan_id) query.plan_id = plan_id;
  if (device_id) query.device_id = device_id;
  return query;
}

export async function runDbQueryTool(
  request: ToolInvocationRequest,
  store: TelecomDbStore,
): Promise<unknown> {
  const { user_id, thread_id } = requireToolScope(request.context);
  const query = parseTelecomQuery(request.arguments);
  return store.query(user_id, thread_id, query);
}

export function createDbQueryInProcessHandler(store: TelecomDbStore): InProcessToolHandler {
  return (request) => runDbQueryTool(request, store);
}

export function createTelecomDbStoreFromBackend(backend: {
  kind: 'postgres' | 'mongo';
  pool?: Pool;
  mongoDb?: Db;
}): TelecomDbStore {
  if (backend.kind === 'postgres') {
    if (!backend.pool) throw new Error('Postgres pool required');
    return createPostgresTelecomDbStore(backend.pool);
  }
  if (!backend.mongoDb) throw new Error('Mongo Db required');
  return createMongoTelecomDbStore(backend.mongoDb);
}
