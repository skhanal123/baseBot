# Telecom reference demo (`@basebot/example-node-demo`)

Reference product for **US-15** / **US-17**: domain tools, migrations, and seed live here — not in `@basebot/node`.

| Path | Purpose |
|------|---------|
| `server.ts` | Minimal entry: listen + shutdown |
| `src/bootstrap/create-demo-application.ts` | US-16 `createServer` wiring |
| `src/tools/` | Three tools: DB, vector manual search, web search |
| `src/seed/` | TOML CRM + support manual embeddings |
| `migrations/` | Telecom + `knowledge_chunks` schema |

## Configuration

Copy [`.env.example`](./.env.example) to the repo root as `.env` and export vars before starting the demo. `loadDemoConfig()` validates required values and maps them to explicit `createServer` options — the framework never reads these env vars.

## Run

From repo root: `pnpm demo:setup` → `pnpm demo` (see root [README](../../README.md)).

HTTP tool sidecar mode: `TELECOM_TOOLS_HTTP=1 pnpm demo`.

## Tests

```bash
pnpm --filter @basebot/example-node-demo run test
```

Covers tool registration boundaries and handler scoping contracts.

## E2E verification

See [docs/integration-guide.md](../../docs/integration-guide.md#e2e-tool-verification-manual).
