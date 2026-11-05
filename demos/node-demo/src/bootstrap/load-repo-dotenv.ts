import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRepoEnv } from '../../../../scripts/lib/load-repo-env.mjs';

/** Repo-root `.env` (see demos/node-demo/.env.example) — same as `demo:setup` / `seed:demo`. */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
loadRepoEnv(process.env, { repoRoot });
