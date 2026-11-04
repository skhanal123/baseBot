import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const indexPath = join(dirname(fileURLToPath(import.meta.url)), 'index.ts');
const indexSource = readFileSync(indexPath, 'utf8').toLowerCase();

/** US-17: publishable SDK must not export telecom demo domain. */
describe('@basebot/node public export boundary', () => {
  it('index.ts does not reference demo-only domain identifiers', () => {
    const forbidden = [
      'telecom',
      'knowledge_chunks',
      'search_telecom',
      'demo_user_customer',
      'seed:demo',
    ];
    for (const token of forbidden) {
      expect(indexSource).not.toContain(token);
    }
  });
});
