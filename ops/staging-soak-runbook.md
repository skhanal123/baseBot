# Staging soak runbook (US-19)

This runbook defines the **v1.0 reliability gate** before customer pilots: a staged environment running the full stack, monitored for **99.9% readiness uptime** and **p95 time-to-first-token (TTFT) &lt; 2s** under the PRD load profile (mock LLM, 200ms TTFT).

## Scope

| Component | Staging requirement |
|-----------|---------------------|
| API | `@basebot/node` Fastify server (reference `demos/node-demo` or your fork) |
| Workers | BullMQ turn workers (in-process or separate worker processes) |
| Redis | Cache + queue + SSE pub/sub |
| Durable store | Postgres (default) or Mongo (`docker-compose --profile mongo`) |
| LLM | **≥2 providers** exercised during the window (rotate env / deployment profile daily or use provider A for soak week 1 and provider B for sign-off replay) |
| Tools | Reference telecom demo profile (`pnpm demo:setup`) |

Production customer infra is out of scope for this gate; see [shared-responsibility-model.md](./shared-responsibility-model.md).

## Minimum soak window

| Gate | Value |
|------|--------|
| **Minimum duration** | **72 hours** continuous monitoring |
| **Uptime target** | **99.9%** of readiness probes in the window |
| **Max allowed failed probes** | `floor(total_probes × 0.001)` (script computes this from elapsed window) |
| **Readiness poll interval** | **30 seconds** (recommended) |
| **TTFT sample interval** | Every **60** readiness polls (~30 min) when using `--ttft-every 60` |
| **TTFT pass criteria** | p95 **&lt; 2000 ms** with **mock LLM** (`LLM_PROVIDER=mock`, `MOCK_LLM_TTFT_MS=200`) |

A longer soak (7 days) is recommended before high-traffic pilots but is not required for v1.0 sign-off.

## Preconditions

1. Staging hosts match [docker-compose](../docker-compose.yml) or equivalent managed Redis + DB.
2. Secrets and provider keys are in staging env only (never the widget).
3. `GET /health` returns `{ "status": "ok" }` (liveness).
4. `GET /health/ready` returns `200` with `{ "status": "ok", "redis": true, "database": true, "worker": true }`.

### Split API / worker deployment

- API instances may set `startWorker: false`.
- At least one worker process must consume `basebot-turns`.
- Readiness on the API still fails if **no BullMQ workers** are connected to the queue.

## Procedure

### 1. Deploy staging stack

```bash
pnpm demo:setup
# Configure staging env: STREAM_SIGNING_SECRET, DURABLE_STORE, LLM_PROVIDER=mock, MOCK_LLM_TTFT_MS=200
pnpm demo
```

For multi-provider coverage, run a **24h slice** per provider (OpenAI + Gemini, etc.) or rotate `LLM_PROVIDER` mid-soak and note provider in the soak report.

### 2. Baseline load (optional, pre-soak)

Validate latency under PRD profile before the long window:

```bash
k6 run -e BASE_URL=https://staging.example tests/load/k6-stream.js
```

Thresholds: `http_req_duration` p95 &lt; 2s and custom `ttft_ms` p95 &lt; 2s.

### 3. Run soak monitor

On a bastion or CI job with network access to staging:

```bash
node scripts/soak-monitor.mjs \
  --base-url https://staging.example \
  --interval-sec 30 \
  --duration-hours 72 \
  --ttft-every 60 \
  --report-dir artifacts/soak
```

The process exits **0** only if uptime and TTFT gates pass. Reports are written under `artifacts/soak/soak-report-*.json`.

### 4. Sign-off checklist

- [ ] Soak report: `readiness.passesGate === true`
- [ ] Soak report: `ttft.passesGate === true` (mock LLM profile)
- [ ] ≥2 LLM providers exercised (document which and when)
- [ ] No unresolved P1 incidents during the window
- [ ] Rollback runbook ([TDD § Rollback](../docs/TDD.md#rollback-plan)) reviewed for staging

## Monitoring hooks

| Signal | Source |
|--------|--------|
| Liveness | `GET /health` |
| Readiness | `GET /health/ready` (Redis, durable DB, workers) |
| TTFT regression | `soak-monitor` TTFT probes or k6 `ttft_ms` trend |
| Queue pressure | Logs / future v1.1 metrics (`basebot.queue.depth`) |

## Failure response

| Symptom | Action |
|---------|--------|
| `worker: false` on ready | Restart worker processes; verify Redis connectivity |
| `database: false` | Check Postgres/Mongo; run migrations |
| Uptime &lt; 99.9% | Capture report JSON; open incident; do not promote to pilot |
| TTFT p95 ≥ 2s sustained | Run k6 profile; check queue concurrency and mock vs real LLM config |

## Artifacts

Store soak JSON reports in your change-management system (ticket / release record). The repo `.gitignore` excludes `artifacts/soak/` by default.
