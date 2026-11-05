import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Parse a `.env`-style file into key/value pairs (no variable expansion).
 * @param {string} content
 */
export function parseEnvFile(content) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Load repo-root `.env` into `process.env` without overriding existing vars.
 * @param {NodeJS.ProcessEnv} [target]
 * @param {{ repoRoot?: string }} [options]
 */
export function loadRepoEnv(target = process.env, options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const envPath = resolve(root, '.env');
  let content;
  try {
    content = readFileSync(envPath, 'utf8');
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') {
      return { loaded: false, path: envPath };
    }
    throw err;
  }

  for (const [key, value] of Object.entries(parseEnvFile(content))) {
    if (value === '') {
      continue;
    }
    if (target[key] === undefined || target[key] === '') {
      target[key] = value;
    }
  }
  return { loaded: true, path: envPath };
}
