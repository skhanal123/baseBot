#!/usr/bin/env node
/**
 * Staging soak monitor (US-19): polls /health/ready, records uptime vs 99.9% gate, optional TTFT probes.
 *
 * Usage:
 *   node scripts/soak-monitor.mjs --base-url http://localhost:3000 --duration-hours 72
 *   node scripts/soak-monitor.mjs --base-url https://staging.example --interval-sec 30 --ttft-every 60
 *
 * Env: BASE_URL (fallback for --base-url)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { probeTimeToFirstToken } from './lib/soak-ttft-probe.mjs';
import {
  DEFAULT_UPTIME_TARGET_PCT,
  percentile,
  summarizeSoak,
} from './lib/soak-uptime.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultReportDir = join(__dirname, '..', 'artifacts', 'soak');

function parseArgs(argv) {
  const opts = {
    baseUrl: process.env.BASE_URL ?? 'http://localhost:3000',
    intervalSec: 30,
    durationHours: null,
    ttftEvery: 0,
    targetPct: DEFAULT_UPTIME_TARGET_PCT,
    reportDir: defaultReportDir,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--base-url') {
      opts.baseUrl = argv[++i];
    } else if (arg === '--interval-sec') {
      opts.intervalSec = Number(argv[++i]);
    } else if (arg === '--duration-hours') {
      opts.durationHours = Number(argv[++i]);
    } else if (arg === '--ttft-every') {
      opts.ttftEvery = Number(argv[++i]);
    } else if (arg === '--target-pct') {
      opts.targetPct = Number(argv[++i]);
    } else if (arg === '--report-dir') {
      opts.reportDir = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/soak-monitor.mjs [options]

Options:
  --base-url URL         API base (default: BASE_URL or http://localhost:3000)
  --interval-sec N       Readiness poll interval (default: 30)
  --duration-hours N     Stop after N hours (default: run until SIGINT)
  --ttft-every N         Run synthetic TTFT probe every N readiness polls (0 = off)
  --target-pct N         Uptime gate target (default: 99.9)
  --report-dir PATH      Write JSON report on exit (default: artifacts/soak)
`);
      process.exit(0);
    }
  }

  return opts;
}

async function pollReady(baseUrl) {
  const at = new Date().toISOString();
  try {
    const res = await fetch(`${baseUrl}/health/ready`);
    const body = await res.json();
    const checks = {
      redis: body.redis === true,
      database: body.database === true,
      worker: body.worker === true,
    };
    const ok = res.status === 200 && body.status === 'ok';
    return { ok, at, statusCode: res.status, checks };
  } catch (err) {
    return {
      ok: false,
      at,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const baseUrl = opts.baseUrl.replace(/\/$/, '');
  const samples = [];
  const ttftMs = [];
  let probeCount = 0;
  const startedAt = Date.now();
  const endAt =
    opts.durationHours != null && !Number.isNaN(opts.durationHours)
      ? startedAt + opts.durationHours * 60 * 60 * 1000
      : null;

  console.log(
    `[soak] base=${baseUrl} interval=${opts.intervalSec}s target=${opts.targetPct}%` +
      (endAt ? ` duration=${opts.durationHours}h` : ' (until SIGINT)'),
  );

  let stopping = false;
  const onSignal = () => {
    stopping = true;
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  while (!stopping) {
    if (endAt != null && Date.now() >= endAt) {
      break;
    }

    const sample = await pollReady(baseUrl);
    samples.push(sample);
    probeCount += 1;

    if (!sample.ok) {
      console.warn(`[soak] not ready @ ${sample.at}`, sample);
    } else if (probeCount % 20 === 0) {
      console.log(`[soak] ok probes=${probeCount}`);
    }

    if (opts.ttftEvery > 0 && probeCount % opts.ttftEvery === 0) {
      try {
        const ms = await probeTimeToFirstToken(baseUrl);
        ttftMs.push(ms);
        console.log(`[soak] ttft_ms=${Math.round(ms)}`);
      } catch (err) {
        console.warn('[soak] ttft probe failed', err);
      }
    }

    if (stopping || (endAt != null && Date.now() >= endAt)) {
      break;
    }

    await sleep(opts.intervalSec * 1000);
  }

  const summary = summarizeSoak(samples, opts.targetPct);
  const ttftP95 = percentile(ttftMs, 95);
  const report = {
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    baseUrl,
    intervalSec: opts.intervalSec,
    durationHours: opts.durationHours,
    readiness: summary,
    ttft: {
      samples: ttftMs.length,
      p95Ms: ttftP95,
      gateTargetP95Ms: 2000,
      passesGate: ttftP95 == null ? null : ttftP95 < 2000,
    },
    samples,
  };

  await mkdir(opts.reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = join(opts.reportDir, `soak-report-${stamp}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`[soak] report ${reportPath}`);
  console.log(
    `[soak] uptime ${summary.uptimePct.toFixed(4)}% (${summary.successfulProbes}/${summary.totalProbes}) gate=${summary.passesGate ? 'PASS' : 'FAIL'}`,
  );
  if (ttftP95 != null) {
    console.log(
      `[soak] ttft p95 ${Math.round(ttftP95)}ms gate=${report.ttft.passesGate ? 'PASS' : 'FAIL'} (target < 2000ms, mock LLM profile)`,
    );
  }

  const exitCode =
    summary.passesGate && (report.ttft.passesGate ?? true) ? 0 : 1;
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
