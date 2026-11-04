/**
 * Postgres demo happy path: infra → framework migrate → demo migrate → seed.
 * See docs/integration-guide.md (US-16).
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

run('docker', ['compose', 'up', '-d']);
run('pnpm', ['migrate']);
run('pnpm', ['--filter', '@basebot/example-node-demo', 'run', 'migrate:demo']);
run('pnpm', ['seed:demo']);

console.log('Demo setup complete. Run `pnpm demo` and `pnpm demo:widget`.');
