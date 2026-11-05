import assert from 'node:assert/strict';
import test from 'node:test';

import { parseEnvFile } from './load-repo-env.mjs';

test('parseEnvFile skips comments and blank lines', () => {
  const parsed = parseEnvFile(`
# comment
DATABASE_URL=postgres://localhost/db

FOO=bar
`);
  assert.equal(parsed.DATABASE_URL, 'postgres://localhost/db');
  assert.equal(parsed.FOO, 'bar');
  assert.equal(parsed['# comment'], undefined);
});

test('parseEnvFile strips matching quotes', () => {
  assert.equal(parseEnvFile('KEY="quoted"').KEY, 'quoted');
  assert.equal(parseEnvFile("KEY='single'").KEY, 'single');
});

test('blank env file values are not applied to process env', () => {
  /** @type {NodeJS.ProcessEnv} */
  const env = { SEED_DATA_DIR: '' };
  for (const [key, value] of Object.entries(parseEnvFile('SEED_DATA_DIR=\nFOO=bar\n'))) {
    if (value === '') {
      continue;
    }
    if (env[key] === undefined || env[key] === '') {
      env[key] = value;
    }
  }
  assert.equal(env.SEED_DATA_DIR, '');
  assert.equal(env.FOO, 'bar');
});
