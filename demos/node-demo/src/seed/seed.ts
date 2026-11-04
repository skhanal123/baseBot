import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from 'mongodb';
import type { Pool } from 'pg';

import { chunkMarkdown } from './chunk-markdown.js';
import { createOpenAiEmbeddingClient, embedInBatches } from './embeddings.js';
import { ensureMongoVectorSearchIndex } from './mongo-vector-index.js';
import { parseDbTomlFile, type TelecomSeedData } from './parse-db-toml.js';
import { toPgVector } from './pg-vector.js';

export const TECH_SUPPORT_SOURCE = 'tech_support_manual';
export const DEFAULT_DEMO_USER_MAPPINGS: Array<{ user_id: string; customer_id: string }> = [
  { user_id: 'usr_browser_demo', customer_id: 'C1001' },
  { user_id: 'usr_demo_sarah', customer_id: 'C1002' },
  { user_id: 'usr_demo_michael', customer_id: 'C1003' },
];

export interface SeedDemoDataOptions {
  seedDir: string;
  store: 'postgres' | 'mongo';
  pool?: Pool;
  mongoDb?: Db;
  openaiApiKey: string;
  userMappings?: Array<{ user_id: string; customer_id: string }>;
}

export interface SeedDemoDataResult {
  telecom: TelecomSeedData;
  chunkCount: number;
}

export async function seedDemoData(options: SeedDemoDataOptions): Promise<SeedDemoDataResult> {
  const dbTomlPath = join(options.seedDir, 'db.toml');
  const manualPath = join(options.seedDir, 'tech_support_manual.md');
  const telecom = parseDbTomlFile(dbTomlPath);
  const manual = readFileSync(manualPath, 'utf8');
  const chunks = chunkMarkdown(manual, TECH_SUPPORT_SOURCE);

  if (options.store === 'postgres') {
    if (!options.pool) {
      throw new Error('pool is required when store is postgres');
    }
    await seedPostgresTelecom(options.pool, telecom, options.userMappings ?? DEFAULT_DEMO_USER_MAPPINGS);
    const chunkCount = await seedPostgresKnowledge(options.pool, chunks, options.openaiApiKey);
    return { telecom, chunkCount };
  }

  if (!options.mongoDb) {
    throw new Error('mongoDb is required when store is mongo');
  }
  await seedMongoTelecom(options.mongoDb, telecom, options.userMappings ?? DEFAULT_DEMO_USER_MAPPINGS);
  const chunkCount = await seedMongoKnowledge(options.mongoDb, chunks, options.openaiApiKey);
  await ensureMongoVectorSearchIndex(options.mongoDb);
  return { telecom, chunkCount };
}

async function seedPostgresTelecom(
  pool: Pool,
  data: TelecomSeedData,
  userMappings: Array<{ user_id: string; customer_id: string }>,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      TRUNCATE TABLE
        knowledge_chunks,
        demo_user_customer_map,
        telecom_bills,
        telecom_lines,
        telecom_customers,
        telecom_devices,
        telecom_plans
      RESTART IDENTITY CASCADE
    `);

    for (const plan of data.plans) {
      await client.query(
        `INSERT INTO telecom_plans (plan_id, name, data_limit_gb, price_per_month, data_refueling_price_per_gb)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          plan.plan_id,
          plan.name,
          plan.data_limit_gb,
          plan.price_per_month,
          plan.data_refueling_price_per_gb,
        ],
      );
    }

    for (const device of data.devices) {
      await client.query(
        `INSERT INTO telecom_devices (
          device_id, device_type, model, imei, is_esim_capable, activated,
          activation_date, last_esim_transfer_date
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          device.device_id,
          device.device_type,
          device.model,
          device.imei,
          device.is_esim_capable,
          device.activated,
          device.activation_date ?? null,
          device.last_esim_transfer_date ?? null,
        ],
      );
    }

    for (const line of data.lines) {
      await client.query(
        `INSERT INTO telecom_lines (
          line_id, phone_number, status, plan_id, device_id, data_used_gb, data_refueling_gb,
          roaming_enabled, contract_end_date, last_plan_change_date, last_sim_replacement_date,
          suspension_start_date
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          line.line_id,
          line.phone_number,
          line.status,
          line.plan_id,
          line.device_id,
          line.data_used_gb,
          line.data_refueling_gb,
          line.roaming_enabled,
          line.contract_end_date ?? null,
          line.last_plan_change_date ?? null,
          line.last_sim_replacement_date ?? null,
          line.suspension_start_date ?? null,
        ],
      );
    }

    for (const customer of data.customers) {
      await client.query(
        `INSERT INTO telecom_customers (
          customer_id, full_name, date_of_birth, email, phone_number, account_status,
          created_at, last_extension_date, goodwill_credit_used_this_year,
          line_ids, bill_ids, payment_methods, address
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          customer.customer_id,
          customer.full_name,
          customer.date_of_birth ?? null,
          customer.email ?? null,
          customer.phone_number ?? null,
          customer.account_status,
          customer.created_at ?? null,
          customer.last_extension_date ?? null,
          customer.goodwill_credit_used_this_year ?? 0,
          JSON.stringify(customer.line_ids ?? []),
          JSON.stringify(customer.bill_ids ?? []),
          JSON.stringify(customer.payment_methods ?? []),
          customer.address ? JSON.stringify(customer.address) : null,
        ],
      );
    }

    for (const bill of data.bills) {
      await client.query(
        `INSERT INTO telecom_bills (
          bill_id, customer_id, period_start, period_end, issue_date,
          total_due, due_date, status, line_items
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          bill.bill_id,
          bill.customer_id,
          bill.period_start ?? null,
          bill.period_end ?? null,
          bill.issue_date ?? null,
          bill.total_due,
          bill.due_date ?? null,
          bill.status,
          JSON.stringify(bill.line_items ?? []),
        ],
      );
    }

    for (const mapping of userMappings) {
      await client.query(`INSERT INTO demo_user_customer_map (user_id, customer_id) VALUES ($1, $2)`, [
        mapping.user_id,
        mapping.customer_id,
      ]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function seedPostgresKnowledge(
  pool: Pool,
  chunks: ReturnType<typeof chunkMarkdown>,
  openaiApiKey: string,
): Promise<number> {
  if (chunks.length === 0) {
    return 0;
  }

  const client = createOpenAiEmbeddingClient(openaiApiKey);
  const embeddings = await embedInBatches(
    client,
    chunks.map((c) => c.content),
  );

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const embedding = embeddings[i] ?? [];
    await pool.query(
      `INSERT INTO knowledge_chunks (source, section, chunk_index, content, embedding)
       VALUES ($1, $2, $3, $4, $5::vector)
       ON CONFLICT (source, chunk_index) DO UPDATE
       SET section = EXCLUDED.section, content = EXCLUDED.content, embedding = EXCLUDED.embedding`,
      [
        TECH_SUPPORT_SOURCE,
        chunk.section,
        chunk.chunkIndex,
        chunk.content,
        toPgVector(embedding),
      ],
    );
  }
  return chunks.length;
}

async function seedMongoTelecom(
  db: Db,
  data: TelecomSeedData,
  userMappings: Array<{ user_id: string; customer_id: string }>,
): Promise<void> {
  await db.collection('knowledge_chunks').deleteMany({});
  await db.collection('telecom_bills').deleteMany({});
  await db.collection('demo_user_customer_map').deleteMany({});
  await db.collection('telecom_customers').deleteMany({});
  await db.collection('telecom_lines').deleteMany({});
  await db.collection('telecom_devices').deleteMany({});
  await db.collection('telecom_plans').deleteMany({});

  if (data.plans.length > 0) await db.collection('telecom_plans').insertMany(data.plans);
  if (data.devices.length > 0) await db.collection('telecom_devices').insertMany(data.devices);
  if (data.lines.length > 0) await db.collection('telecom_lines').insertMany(data.lines);
  if (data.customers.length > 0) await db.collection('telecom_customers').insertMany(data.customers);
  if (data.bills.length > 0) await db.collection('telecom_bills').insertMany(data.bills);
  if (userMappings.length > 0) await db.collection('demo_user_customer_map').insertMany(userMappings);
}

async function seedMongoKnowledge(
  db: Db,
  chunks: ReturnType<typeof chunkMarkdown>,
  openaiApiKey: string,
): Promise<number> {
  if (chunks.length === 0) {
    return 0;
  }

  const client = createOpenAiEmbeddingClient(openaiApiKey);
  const embeddings = await embedInBatches(
    client,
    chunks.map((c) => c.content),
  );

  const docs = chunks.map((chunk, i) => ({
    source: TECH_SUPPORT_SOURCE,
    section: chunk.section,
    chunk_index: chunk.chunkIndex,
    content: chunk.content,
    embedding: embeddings[i] ?? [],
  }));

  await db.collection('knowledge_chunks').insertMany(docs);
  return docs.length;
}
