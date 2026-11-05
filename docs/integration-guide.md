# baseBot integration guide

The **framework** packages (`@basebot/core`, `@basebot/node`, `@basebot/react`) provide chat threads, streaming, queues, LLM adapters, and tool execution. The **telecom reference demo** under `demos/` adds CRM data, embeddings, and three sample tools on top of the same API.

Framework migrations create threads and messages only. Demo migrations and seed scripts add domain tables and sample knowledge in the same database for local development.

## Run the reference demo

Use the root [README.md](../README.md) quick start: copy `demos/node-demo/.env.example` to `.env`, set API keys, then `pnpm demo:setup`, `pnpm demo`, and `pnpm demo:widget`.

Postgres with pgvector is the default local path. Optional Mongo durable storage is documented in the README; use Postgres when testing vector search locally.

## Build your own integration

- Bootstrap the server with `createServer` from `@basebot/node`. The library does not load deployment environment variables—you supply store, cache, Redis, stream signing secret, LLM config, tools, and optional hooks or extra routes.
- Use `demos/node-demo` as a working template: config in `demos/node-demo/src/config/`, tools in `demos/node-demo/src/tools/`, env mapping in `demos/node-demo/.env.example`.
- Keep domain schema, seeds, and tool handlers in your app; keep `@basebot/node` free of product-specific tables and routes.

Public HTTP shapes are in [docs/openapi.yaml](./openapi.yaml). Regenerate after contract changes with `pnpm generate:openapi`.

## Manual smoke check

With the demo running and keys configured, confirm tool use from the widget:

- CRM: ask what the current plan is or to show lines—answers should match the signed-in demo user.
- Manual search: ask how to fix mobile data or MMS—expect support-manual content on Postgres.
- Web: ask for recent news outside seed data—expect web search when the model calls that tool.

Switch demo users via `VITE_USER_ID` on the widget dev server and confirm CRM answers change per user.

## Operations

- Liveness: `GET /health`
- Readiness (Redis, store, workers): `GET /health/ready` (503 when degraded)
- Long-run staging checks: [ops/staging-soak-runbook.md](../ops/staging-soak-runbook.md)
- SLA boundaries: [ops/shared-responsibility-model.md](../ops/shared-responsibility-model.md)
