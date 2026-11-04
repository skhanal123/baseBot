import { describe, expect, it } from 'vitest';

import { getTelecomToolRegistrations } from './register-tools.js';

describe('getTelecomToolRegistrations (US-15 / US-17)', () => {
  it('registers exactly the three reference demo tools (no legacy placeholders)', () => {
    const registrations = getTelecomToolRegistrations({
      backend: {
        kind: 'postgres',
        pool: null as never,
        openaiApiKey: 'test-key',
      },
      mode: 'http',
      httpBaseUrl: 'http://127.0.0.1:3000',
    });

    expect(registrations).toHaveLength(3);
    const names = registrations.map((r) => r.definition.name).sort();
    expect(names).toEqual(['search_support_manual', 'search_telecom_database', 'web_search']);
    expect(names).not.toContain('get_order_status');
  });
});
