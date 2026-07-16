# Architecture overview

Gatekeeper is a local-first, evidence-first repository governance agent. Codex remains the reasoning surface; Gatekeeper owns bounded evidence retrieval and deterministic enforcement.

## Intended runtime

```text
Codex -> repository skill -> stdio MCP -> localhost API -> application core
Browser dashboard --------------------------^            -> SQLite Project Memory
                                                           -> local Git / read-only gh
```

Phase 0 implements only the pure foundation and CLI Doctor:

```text
apps/cli -> packages/config
packages/contracts -> packages/domain
packages/testkit -> packages/domain
```

The `domain` package owns public entities and the safety rule that only a hard deterministic finding can produce `BLOCK`. `contracts` owns strict serialized shapes. Presentation and future adapters must depend inward and must not redefine these rules.

## Runtime constraints

- Node.js 24 LTS, strict TypeScript ESM, pnpm workspaces, and TypeScript project references.
- No Turborepo; root scripts are sufficient for the hackathon workspace.
- Tests are deterministic and offline.
- Packages are created only in the phase that needs working behavior.

## Phase 1 entry

Phase 1 may add only `packages/git-adapter`, `apps/server`, and `apps/dashboard` as defined by the canonical plan. It must keep the foreground localhost service bound to `127.0.0.1`, use real repository data, and stop before SQLite, MCP, or GitHub calls.
