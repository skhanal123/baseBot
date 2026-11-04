import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  computeUptimePct,
  maxAllowedDowntimeMs,
  passesUptimeGate,
  percentile,
  summarizeSoak,
} from './soak-uptime.mjs';

describe('soak-uptime', () => {
  it('computes uptime percentage', () => {
    assert.equal(computeUptimePct(999, 1000), 99.9);
    assert.equal(passesUptimeGate(99.9), true);
    assert.equal(passesUptimeGate(99.89), false);
  });

  it('derives max allowed downtime from window', () => {
    const hourMs = 60 * 60 * 1000;
    assert.ok(
      Math.abs(maxAllowedDowntimeMs(hourMs, 99.9) - hourMs * 0.001) < 0.01,
    );
  });

  it('summarizes readiness samples', () => {
    const samples = [
      {
        ok: true,
        at: '2026-01-01T00:00:00.000Z',
        checks: { redis: true, database: true, worker: true },
      },
      {
        ok: true,
        at: '2026-01-01T01:00:00.000Z',
        checks: { redis: false, database: true, worker: true },
      },
    ];
    const summary = summarizeSoak(samples);
    assert.equal(summary.totalProbes, 2);
    assert.equal(summary.successfulProbes, 1);
    assert.equal(summary.uptimePct, 50);
    assert.equal(summary.passesGate, false);
    assert.equal(summary.windowMs, 60 * 60 * 1000);
  });

  it('computes percentiles', () => {
    assert.equal(percentile([100, 200, 300, 400], 95), 400);
    assert.equal(percentile([], 95), null);
  });
});
