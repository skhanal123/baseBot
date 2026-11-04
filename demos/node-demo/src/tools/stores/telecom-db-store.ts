/**
 * Telecom CRM queries for the reference demo only (US-15 / US-17 — not part of `@basebot/node`).
 *
 * Scoping pattern:
 * - Resolve `customer_id` from `demo_user_customer_map` using injected `user_id`.
 * - Restrict lines/bills/devices to that customer's `line_ids` / `customer_id`.
 * - Echo `user_id` and `thread_id` in responses for audit; thread_id is not a DB key here but
 *   must still be validated at the handler layer (`requireToolScope`).
 *
 * Example Postgres predicate (bills):
 *   `SELECT * FROM telecom_bills WHERE customer_id = $1` — never query by LLM-supplied customer id alone.
 */
import type { Db } from 'mongodb';
import type { Pool } from 'pg';

import {
  resolveCustomerIdForUserMongo,
  resolveCustomerIdForUserPostgres,
} from './resolve-customer.js';

export type TelecomEntity =
  | 'customer_profile'
  | 'lines'
  | 'bills'
  | 'plans'
  | 'devices';

export interface TelecomDbQuery {
  entity: TelecomEntity;
  line_id?: string;
  bill_id?: string;
  phone_number?: string;
  plan_id?: string;
  device_id?: string;
}

export interface TelecomDbStore {
  query(user_id: string, thread_id: string, query: TelecomDbQuery): Promise<unknown>;
}

export function createPostgresTelecomDbStore(pool: Pool): TelecomDbStore {
  return {
    query: (user_id, thread_id, q) => runPostgresQuery(pool, user_id, thread_id, q),
  };
}

export function createMongoTelecomDbStore(db: Db): TelecomDbStore {
  return {
    query: (user_id, thread_id, q) => runMongoQuery(db, user_id, thread_id, q),
  };
}

async function runPostgresQuery(
  pool: Pool,
  user_id: string,
  thread_id: string,
  q: TelecomDbQuery,
): Promise<unknown> {
  const customer_id = await resolveCustomerIdForUserPostgres(pool, user_id);
  if (!customer_id && q.entity !== 'plans') {
    return {
      error: 'no_customer_mapping',
      message: `No telecom customer mapped for user_id ${user_id}. Run pnpm seed:demo.`,
      user_id,
      thread_id,
    };
  }

  if (q.entity === 'plans') {
    if (q.plan_id) {
      const plan = await pool.query(`SELECT * FROM telecom_plans WHERE plan_id = $1`, [q.plan_id]);
      return { user_id, thread_id, plans: plan.rows };
    }
    const plans = await pool.query(`SELECT * FROM telecom_plans ORDER BY plan_id`);
    return { user_id, thread_id, plans: plans.rows };
  }

  if (q.entity === 'customer_profile') {
    const customer = await pool.query(`SELECT * FROM telecom_customers WHERE customer_id = $1`, [
      customer_id,
    ]);
    return { user_id, thread_id, customer_id, customer: customer.rows[0] ?? null };
  }

  if (q.entity === 'lines') {
    const customer = await pool.query<{ line_ids: string[] }>(
      `SELECT line_ids FROM telecom_customers WHERE customer_id = $1`,
      [customer_id],
    );
    const lineIds = customer.rows[0]?.line_ids ?? [];
    let sql = `SELECT l.*, p.name AS plan_name, d.model AS device_model
               FROM telecom_lines l
               JOIN telecom_plans p ON p.plan_id = l.plan_id
               JOIN telecom_devices d ON d.device_id = l.device_id
               WHERE l.line_id = ANY($1::text[])`;
    const params: unknown[] = [lineIds];
    if (q.line_id) {
      sql += ` AND l.line_id = $2`;
      params.push(q.line_id);
    }
    if (q.phone_number) {
      sql += ` AND l.phone_number = $${String(params.length + 1)}`;
      params.push(q.phone_number);
    }
    const lines = await pool.query(sql, params);
    return { user_id, thread_id, customer_id, lines: lines.rows };
  }

  if (q.entity === 'bills') {
    let sql = `SELECT * FROM telecom_bills WHERE customer_id = $1`;
    const params: unknown[] = [customer_id];
    if (q.bill_id) {
      sql += ` AND bill_id = $2`;
      params.push(q.bill_id);
    }
    sql += ` ORDER BY issue_date DESC NULLS LAST`;
    const bills = await pool.query(sql, params);
    return { user_id, thread_id, customer_id, bills: bills.rows };
  }

  if (q.entity === 'devices') {
    const customer = await pool.query<{ line_ids: string[] }>(
      `SELECT line_ids FROM telecom_customers WHERE customer_id = $1`,
      [customer_id],
    );
    const lineIds = customer.rows[0]?.line_ids ?? [];
    let sql = `SELECT DISTINCT d.*
               FROM telecom_devices d
               JOIN telecom_lines l ON l.device_id = d.device_id
               WHERE l.line_id = ANY($1::text[])`;
    const params: unknown[] = [lineIds];
    if (q.device_id) {
      sql += ` AND d.device_id = $2`;
      params.push(q.device_id);
    }
    const devices = await pool.query(sql, params);
    return { user_id, thread_id, customer_id, devices: devices.rows };
  }

  return { error: 'unsupported_entity', entity: q.entity };
}

async function runMongoQuery(
  db: Db,
  user_id: string,
  thread_id: string,
  q: TelecomDbQuery,
): Promise<unknown> {
  const customer_id = await resolveCustomerIdForUserMongo(db, user_id);
  if (!customer_id && q.entity !== 'plans') {
    return {
      error: 'no_customer_mapping',
      message: `No telecom customer mapped for user_id ${user_id}. Run pnpm seed:demo.`,
      user_id,
      thread_id,
    };
  }

  if (q.entity === 'plans') {
    const filter = q.plan_id ? { plan_id: q.plan_id } : {};
    const plans = await db.collection('telecom_plans').find(filter).sort({ plan_id: 1 }).toArray();
    return { user_id, thread_id, plans };
  }

  if (q.entity === 'customer_profile') {
    const customer = await db.collection('telecom_customers').findOne({ customer_id });
    return { user_id, thread_id, customer_id, customer };
  }

  const customer = await db.collection('telecom_customers').findOne<{ line_ids: string[] }>({
    customer_id,
  });
  const lineIds = customer?.line_ids ?? [];

  if (q.entity === 'lines') {
    if (q.line_id && !lineIds.includes(q.line_id)) {
      return { user_id, thread_id, customer_id, lines: [] };
    }
    const filter: Record<string, unknown> = q.line_id
      ? { line_id: q.line_id }
      : { line_id: { $in: lineIds } };
    if (q.phone_number) {
      filter.phone_number = q.phone_number;
    }
    const lines = await db.collection('telecom_lines').find(filter).toArray();
    return { user_id, thread_id, customer_id, lines };
  }

  if (q.entity === 'bills') {
    const filter: Record<string, unknown> = { customer_id };
    if (q.bill_id) {
      filter.bill_id = q.bill_id;
    }
    const bills = await db.collection('telecom_bills').find(filter).toArray();
    return { user_id, thread_id, customer_id, bills };
  }

  if (q.entity === 'devices') {
    const lines = await db.collection('telecom_lines').find({ line_id: { $in: lineIds } }).toArray();
    const deviceIds = [...new Set(lines.map((l) => String(l.device_id)))];
    const filter: Record<string, unknown> = { device_id: { $in: deviceIds } };
    if (q.device_id) {
      filter.device_id = q.device_id;
    }
    const devices = await db.collection('telecom_devices').find(filter).toArray();
    return { user_id, thread_id, customer_id, devices };
  }

  return { error: 'unsupported_entity', entity: q.entity };
}
