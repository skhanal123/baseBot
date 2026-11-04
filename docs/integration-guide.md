# baseBot integration guide

PRD: **US-15** (reference demo), **US-16** (SDK bootstrap), **US-17** (demo-only domain code).

## Framework vs reference product

| Layer | Location | Owns |
|-------|----------|------|
| **Framework** | `@basebot/core`, `@basebot/node`, `@basebot/react` | Threads/messages, SSE, queue, LLM adapters, tool runner, `createServer` |
| **Reference product** | `demos/node-demo` | Telecom CRM schema, seed data, pgvector / Mongo vector indexes, three domain tools |

Framework Postgres migrations (`001_*`) create **threads and messages only**. Demo migrations add telecom tables and vector storage in the **same database** for local dev.

## Architecture

```
@basebot/react  →  demos/node-demo (Fastify via createServer)
                      ├─ baseBot threads/messages (same Postgres or Mongo)
                      └─ telecom tables + knowledge_chunks (demo-owned schema)
```

## Quick start (telecom demo, Postgres)

1. Copy `.env.example` → `.env` — set `OPENAI_API_KEY`, `SERPER_API_KEY`.
2. `pnpm install && pnpm build`
3. **`pnpm demo:setup`** — `docker compose up -d` → `pnpm migrate` → demo migrate → seed  
   (Equivalent manual steps: compose up, `pnpm migrate`, `pnpm --filter @basebot/example-node-demo run migrate:demo`, `pnpm seed:demo`.)
4. `pnpm demo` and `pnpm demo:widget`

Widget default user `usr_browser_demo` maps to customer **C1001** after seeding.

## SDK bootstrap (US-16)

`@basebot/node` does **not** read deployment env vars. Pass explicit options (your app may load them from `.env`, K8s, etc.):

```typescript
import { createServer } from '@basebot/node';

const app = await createServer({
  store,
  cache,
  redis,
  streamSigningSecret: process.env.STREAM_SIGNING_SECRET!, // validated in your bootstrap
  llm: { provider: 'openai', apiKey: '...', model: 'gpt-4o-mini' },
  tools: [{ definition: myTool, handler: myHandler }],
  hooks: { beforeTurn: [myHook] },
  registerRoutes: (server) => {
    server.get('/internal/health-extra', async () => ({ ok: true }));
  },
});
```

Required at bootstrap: **`streamSigningSecret`**, **`llm`** (or prior `configureLLM()`). Missing values throw immediately.

The telecom demo uses `loadDemoConfig()` in `demos/node-demo/src/config/` and optional `resolveLlmConfigFromEnv()` to map env → `LLMConfig` (including `apiKey`). See `demos/node-demo/.env.example`.

`registerTool`, `registerHooks`, and `configureLLM` before `createServer` still work; inline `llm` overrides global `configureLLM`.

## Tool contract (framework)

Handlers receive `{ arguments, context }` with `user_id`, `thread_id`, `message_id`, `correlation_id`.  
Implementations live in `demos/node-demo/src/tools/` — see `register-tools.ts`.

| Tool | Purpose |
|------|---------|
| `search_telecom_database` | Scoped CRM data from seeded TOML |
| `search_support_manual` | pgvector (Postgres) or `$vectorSearch` (Mongo) |
| `web_search` | Serper API |

## Wiring your own product

1. Create an app package (or fork `demos/node-demo`).
2. Pass `tools`, `llm`, and optional `hooks` / `registerRoutes` to `createServer`.
3. Own your migrations, seed scripts, and tool handlers.
4. Keep `@basebot/node` free of domain-specific tables and APIs.

## Mongo vector search

Mongo seed calls `createSearchIndex` on `knowledge_chunks.embedding`. Requires **Atlas** or a deployment with **mongot** (Atlas Vector Search). Local standalone Mongo may not support `$vectorSearch`; use Postgres for local vector demos.

## Tool scoping (US-8 / US-17)

Framework tool invocations always include `context.user_id`, `context.thread_id`, `message_id`, and `correlation_id`. Demo handlers call `requireToolScope()` then pass `user_id` into store queries — see `demos/node-demo/src/tools/scoping.ts` and `stores/telecom-db-store.ts`.

Run demo contract tests: `pnpm --filter @basebot/example-node-demo run test`.

## E2E tool verification (manual)

After `pnpm demo:setup`, with `OPENAI_API_KEY` and `SERPER_API_KEY` set:

1. `pnpm demo` and `pnpm demo:widget` (widget user defaults to `usr_browser_demo` → customer **C1001**).
2. **DB tool** — ask: *What is my current plan?* or *Show my lines.* Expect CRM data for C1001 only.
3. **Vector tool** — ask: *How do I fix mobile data or MMS?* Expect support-manual excerpts (pgvector on Postgres).
4. **Web tool** — ask something outside seed data, e.g. *Latest FCC net neutrality news.* Expect Serper-backed snippets when the model invokes `web_search`.

Cross-user check: create a thread with a different `user_id` mapped in seed (e.g. `usr_demo_sarah` → C1002) and confirm account answers differ. Framework isolation tests (`pnpm --filter @basebot/node run test`) remain unchanged and do not depend on demo schema.

## Further reading

- `docs/openapi.yaml` — public HTTP contract
- `seed/main_policy.md` — sample agent policy (not auto-loaded)
- `docs/TDD.md`, `docs/PRD.md`
