# Architecture overview

Gatekeeper is a local-first, evidence-first repository governance agent. Codex remains the reasoning surface; Gatekeeper owns bounded evidence retrieval and deterministic enforcement.

## Intended runtime

```text
Codex -> repository skill -> stdio MCP -> localhost API -> application core
Browser dashboard --------------------------^            -> SQLite Project Memory
                                                           -> local Git / read-only gh
```

The current Phase 1 foundation adds the first concrete infrastructure adapter:

```text
apps/cli -> packages/config
apps/server -> packages/config + packages/contracts
packages/git-adapter -> packages/contracts
packages/contracts -> packages/domain
packages/testkit -> packages/domain
```

The `domain` package owns public entities and the safety rule that only a hard deterministic finding can produce `BLOCK`. `contracts` owns strict serialized shapes. Presentation and future adapters must depend inward and must not redefine these rules.

`git-adapter` resolves the repository selected at startup, verifies that Git's discovered top level contains the requested path, and returns a strict `RepositorySnapshot` with root, branch, HEAD, dirty state, and origin. Every Git invocation uses `execa` with an executable plus an argument array. Detached HEAD and an absent `origin` are represented as `null` rather than invented values.

The Phase 1 status contracts also define health, authenticated status, dashboard bootstrap, tool availability, and machine-local service metadata. Fastify JSON Schemas are generated directly from these Zod contracts.

`apps/server` is a foreground-only Fastify adapter. It binds to an ephemeral port on `127.0.0.1`, writes ephemeral connection metadata under machine-local app data, serves the static dashboard, and exposes only `/health`, `/bootstrap.json`, and `/v1/status` in this phase. The repository snapshot is provided at startup and no HTTP input can select another path.

## Runtime constraints

- Node.js 24 LTS, strict TypeScript ESM, pnpm workspaces, and TypeScript project references.
- No Turborepo; root scripts are sufficient for the hackathon workspace.
- Tests are deterministic and offline.
- Packages are created only in the phase that needs working behavior.

## Phase 1 boundary

Phase 1 may add only `packages/git-adapter`, `apps/server`, and `apps/dashboard` as defined by the canonical plan. The remaining work is the real dashboard shell and CLI lifecycle integration. The phase must stop before diff review, SQLite, MCP, or GitHub calls.
