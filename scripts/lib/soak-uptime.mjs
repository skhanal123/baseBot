/** @typedef {{ ok: boolean; at: string; statusCode?: number; checks?: Record<string, boolean>; error?: string }} ReadinessSample */

export const DEFAULT_UPTIME_TARGET_PCT = 99.9;

/**
 * @param {number} successfulProbes
 * @param {number} totalProbes
 */
export function computeUptimePct(successfulProbes, totalProbes) {
  if (totalProbes <= 0) {
    return 0;
  }
  return (successfulProbes / totalProbes) * 100;
}

/**
 * @param {number} uptimePct
 * @param {number} [targetPct]
 */
export function passesUptimeGate(uptimePct, targetPct = DEFAULT_UPTIME_TARGET_PCT) {
  return uptimePct >= targetPct;
}

/**
 * Allowed downtime for a window at a given uptime target (e.g. 99.9% → 0.1% downtime).
 * @param {number} windowMs
 * @param {number} [targetPct]
 */
export function maxAllowedDowntimeMs(windowMs, targetPct = DEFAULT_UPTIME_TARGET_PCT) {
  const downtimeFraction = (100 - targetPct) / 100;
  return windowMs * downtimeFraction;
}

/**
 * @param {number[]} values
 * @param {number} p percentile in 0–100
 */
export function percentile(values, p) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  const index = Math.min(Math.max(rank, 0), sorted.length - 1);
  return sorted[index];
}

/**
 * @param {ReadinessSample} sample
 */
export function isReadySample(sample) {
  if (!sample.ok) {
    return false;
  }
  const checks = sample.checks;
  if (!checks) {
    return true;
  }
  return checks.redis === true && checks.database === true && checks.worker === true;
}

/**
 * @param {ReadinessSample[]} samples
 * @param {number} [targetPct]
 */
export function summarizeSoak(samples, targetPct = DEFAULT_UPTIME_TARGET_PCT) {
  const total = samples.length;
  const successful = samples.filter(isReadySample).length;
  const uptimePct = computeUptimePct(successful, total);
  const firstAt = samples[0]?.at;
  const lastAt = samples[total - 1]?.at;
  let windowMs = 0;
  if (firstAt && lastAt) {
    windowMs = Math.max(0, Date.parse(lastAt) - Date.parse(firstAt));
  }

  return {
    totalProbes: total,
    successfulProbes: successful,
    failedProbes: total - successful,
    uptimePct,
    targetPct,
    passesGate: passesUptimeGate(uptimePct, targetPct),
    maxAllowedDowntimeMs: maxAllowedDowntimeMs(windowMs, targetPct),
    windowMs,
  };
}
