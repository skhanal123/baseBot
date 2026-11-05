/**
 * Repo entrypoint for demo seeding (telecom TOML + support manual embeddings).
 * Core logic: packages/node/src/demo-data/
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRepoEnv } from './lib/load-repo-env.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

loadRepoEnv(process.env, { repoRoot });

const result = spawnSync('pnpm', ['--filter', '@basebot/example-node-demo', 'run', 'seed:demo'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
