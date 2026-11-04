import { describe, expect, it } from 'vitest';

import { readinessStatus } from './health-probes.js';

describe('readinessStatus', () => {
  it('returns ok when all checks pass', () => {
    expect(
      readinessStatus({ redis: true, database: true, worker: true }),
    ).toBe('ok');
  });

  it('returns degraded when any check fails', () => {
    expect(
      readinessStatus({ redis: true, database: false, worker: true }),
    ).toBe('degraded');
    expect(
      readinessStatus({ redis: true, database: true, worker: false }),
    ).toBe('degraded');
  });
});
