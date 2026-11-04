import { runMigrations } from '@basebot/node';
import { Pool } from 'pg';

import { runDemoMigrations } from './run-demo-migrations.js';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://basebot:basebot@localhost:5434/basebot';

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  await runMigrations(pool);
  await runDemoMigrations(pool);
  console.log('Applied baseBot + telecom demo migrations.');
  await pool.end();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
