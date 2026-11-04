# Shared responsibility model — uptime & SLA claims

baseBot is an **embeddable SDK** that customers run on **their** infrastructure. The framework team can validate behavior in **staging** (US-19); **production** uptime is always a joint responsibility.

## What the framework provides

| Area | Framework responsibility |
|------|---------------------------|
| API contract | Versioned REST + SSE documented in `docs/openapi.yaml` |
| Health probes | `GET /health` (liveness), `GET /health/ready` (Redis, durable store, workers) |
| Reliability patterns | Async queue ingest, idempotent streaming, thread ACL, structured errors |
| Staging gate | Documented soak runbook targeting **99.9% readiness** over **72h** ([staging-soak-runbook.md](./staging-soak-runbook.md)) |
| Performance profile | k6 script + mock LLM adapter for reproducible TTFT tests |

## What the customer / operator owns

| Area | Customer responsibility |
|------|-------------------------|
| Hosting | API processes, worker processes, Redis, database, networking, TLS |
| Scaling | Worker concurrency, horizontal replicas, Redis/DB sizing |
| Secrets | LLM keys, tool credentials, `STREAM_SIGNING_SECRET` |
| Identity | Trusted `user_id` (or BFF-issued tokens); thread ACL depends on correct caller behavior |
| Monitoring & alerting | Uptime checks on `/health/ready`, log aggregation, on-call |
| Provider SLAs | OpenAI / Gemini / Claude / DeepSeek availability and rate limits |
| Data & compliance | PII handling, retention, regional residency, GDPR delete (v1.1 API) |

## SLA language (recommended)

- **Framework staging claim (v1.0):** “Passes US-19 soak gate: ≥99.9% readiness over 72h on reference staging stack with mock LLM TTFT profile.”
- **Customer production claim:** “Uptime SLA is defined between the customer and **their** end users, measured on the customer’s deployment of baseBot plus dependencies.”
- **Do not imply:** That the baseBot npm package alone guarantees 99.9% monthly uptime on arbitrary customer clouds without operational investment.

## Measuring production uptime

1. Probe **`/health/ready`** from outside the cluster (same checks as soak monitor).
2. Treat **503** or any `false` in `redis` / `database` / `worker` as **down** for SLA math.
3. Exclude planned maintenance windows explicitly in customer SLA docs.
4. Correlate incidents using `correlation_id` / `x-correlation-id` from API responses and logs.

## Support boundaries

| Issue type | Typical owner |
|------------|-------------|
| Bug in stream ACL or thread limit | Framework maintainers |
| Redis memory pressure | Customer ops |
| LLM 429/5xx spikes | Customer (provider quotas, fallback routing) |
| Tool SSRF / data leak in custom SQL | Customer (tool implementation) |

For integration boundaries, see [integration-guide.md](../docs/integration-guide.md).
