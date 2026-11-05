import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MongoClient } from 'mongodb';
import { Pool } from 'pg';
import { runMigrations } from '@basebot/node';

import { runDemoMigrations } from '../db/run-demo-migrations.js';
import { seedDemoData } from './seed.js';

const seedDataDir = process.env.SEED_DATA_DIR?.trim();
const seedDir = seedDataDir ? resolve(seedDataDir) : defaultSeedDir();
const store = (process.env.DURABLE_STORE ?? 'postgres').trim().toLowerCase();
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://basebot:basebot@localhost:5434/basebot';
const mongoUrl = process.env.MONGODB_URL ?? 'mongodb://localhost:27017/basebot';
const openaiApiKey = process.env.OPENAI_API_KEY;

function defaultSeedDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '../../../../seed');
}

async function main(): Promise<void> {
  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY is required to embed tech_support_manual.md');
  }

  if (store === 'mongo') {
    const client = new MongoClient(mongoUrl);
    await client.connect();
    const dbName = new URL(mongoUrl).pathname.replace(/^\//, '') || 'basebot';
    const db = client.db(dbName);
    const result = await seedDemoData({
      seedDir,
      store: 'mongo',
      mongoDb: db,
      openaiApiKey,
    });
    console.log(
      `Seeded Mongo telecom demo: ${String(result.telecom.customers.length)} customers, ${String(result.chunkCount)} embedded chunks (vector index requested).`,
    );
    await client.close();
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  await runMigrations(pool);
  await runDemoMigrations(pool);
  const result = await seedDemoData({
    seedDir,
    store: 'postgres',
    pool,
    openaiApiKey,
  });
  console.log(
    `Seeded Postgres telecom demo: ${String(result.telecom.customers.length)} customers, ${String(result.chunkCount)} pgvector chunks.`,
  );
  await pool.end();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
