/**
 * Local demo happy path (US-16 / US-18): infra → migrate (Postgres) → seed.
 * Honors DURABLE_STORE: postgres (default) | mongo (compose --profile mongo).
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { planDemoSetup } from './lib/demo-setup-plan.mjs';
import { loadRepoEnv } from './lib/load-repo-env.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

loadRepoEnv(process.env, { repoRoot });

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const plan = planDemoSetup(process.env);

run('docker', plan.composeArgs);

for (const step of plan.steps) {
  if (step === 'migrate') {
    run('pnpm', ['migrate']);
  } else if (step === 'migrate:demo') {
    run('pnpm', ['--filter', '@basebot/example-node-demo', 'run', 'migrate:demo']);
  } else if (step === 'seed:demo') {
    run('pnpm', ['seed:demo']);
  } else {
    throw new Error(`Unknown demo setup step: ${step}`);
  }
}

const storeHint =
  plan.store === 'mongo'
    ? ' (DURABLE_STORE=mongo — vector search needs Atlas/mongot; CRM + thread store use local Mongo)'
    : '';

console.log(`Demo setup complete${storeHint}. Run \`pnpm demo\` and \`pnpm demo:widget\`.`);
