import type { Db } from 'mongodb';
import type { Pool } from 'pg';

import {
  resolveCustomerIdForUserMongo,
  resolveCustomerIdForUserPostgres,
} from '../tools/stores/resolve-customer.js';
import type { TelecomToolBackend } from '../tools/telecom-backend.js';

export interface DemoContextPayload {
  user_id: string;
  customer_id: string | null;
  display_name: string | null;
  account_status: string | null;
  line_count: number;
  primary_plan_name: string | null;
}

async function primaryPlanNamePostgres(
  pool: Pool,
  lineIds: string[],
): Promise<string | null> {
  if (lineIds.length === 0) {
    return null;
  }
  const result = await pool.query<{ name: string }>(
    `SELECT p.name
     FROM telecom_lines l
     JOIN telecom_plans p ON p.plan_id = l.plan_id
     WHERE l.line_id = ANY($1::text[])
     ORDER BY l.line_id
     LIMIT 1`,
    [lineIds],
  );
  return result.rows[0]?.name ?? null;
}

async function resolvePostgres(pool: Pool, user_id: string): Promise<DemoContextPayload> {
  const customer_id = await resolveCustomerIdForUserPostgres(pool, user_id);
  if (!customer_id) {
    return {
      user_id,
      customer_id: null,
      display_name: null,
      account_status: null,
      line_count: 0,
      primary_plan_name: null,
    };
  }

  const customer = await pool.query<{
    full_name: string;
    account_status: string;
    line_ids: string[];
  }>(`SELECT full_name, account_status, line_ids FROM telecom_customers WHERE customer_id = $1`, [
    customer_id,
  ]);
  const row = customer.rows[0];
  const lineIds = row?.line_ids ?? [];
  const primary_plan_name = await primaryPlanNamePostgres(pool, lineIds);

  return {
    user_id,
    customer_id,
    display_name: row?.full_name ?? null,
    account_status: row?.account_status ?? null,
    line_count: lineIds.length,
    primary_plan_name,
  };
}

async function primaryPlanNameMongo(db: Db, lineIds: string[]): Promise<string | null> {
  if (lineIds.length === 0) {
    return null;
  }
  const line = await db.collection('telecom_lines').findOne<{ plan_id: string }>({
    line_id: lineIds[0],
  });
  if (!line?.plan_id) {
    return null;
  }
  const plan = await db.collection('telecom_plans').findOne<{ name: string }>({
    plan_id: line.plan_id,
  });
  return plan?.name ?? null;
}

async function resolveMongo(db: Db, user_id: string): Promise<DemoContextPayload> {
  const customer_id = await resolveCustomerIdForUserMongo(db, user_id);
  if (!customer_id) {
    return {
      user_id,
      customer_id: null,
      display_name: null,
      account_status: null,
      line_count: 0,
      primary_plan_name: null,
    };
  }

  const customer = await db.collection('telecom_customers').findOne<{
    full_name: string;
    account_status: string;
    line_ids: string[];
  }>({ customer_id });
  const lineIds = customer?.line_ids ?? [];
  const primary_plan_name = await primaryPlanNameMongo(db, lineIds);

  return {
    user_id,
    customer_id,
    display_name: customer?.full_name ?? null,
    account_status: customer?.account_status ?? null,
    line_count: lineIds.length,
    primary_plan_name,
  };
}

export async function resolveDemoContext(
  backend: TelecomToolBackend,
  user_id: string,
): Promise<DemoContextPayload> {
  if (backend.kind === 'postgres') {
    if (!backend.pool) throw new Error('Postgres pool required');
    return resolvePostgres(backend.pool, user_id);
  }
  if (!backend.mongoDb) throw new Error('Mongo Db required');
  return resolveMongo(backend.mongoDb, user_id);
}
