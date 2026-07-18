# Architecture overview

Gatekeeper is a local-first, evidence-first repository governance agent. Codex remains the reasoning surface; Gatekeeper owns bounded evidence retrieval and deterministic enforcement.

## Current Phase 5 runtime

```text
bounded Git metadata/docs ─> Project Memory index ─> SQLite + FTS5 ─> memory search
                                                                  │
CLI review ─┐                                                     │
            ├─> policy ─> bounded ChangeSet ─> review engine ─> ReviewRun v1
HTTP review ┘                                                 │       │
                                                              └─> persisted review
                                                                  │
                                    CLI text/JSON <─ local API ─> React dashboard
```

The Codex path is `Codex skill -> seven stdio MCP tools -> fixed loopback API -> review engine / Project Memory -> persisted ReviewRun`. The MCP process never bypasses the API to reach Git, GitHub, SQLite, or repository files.

The current dependency direction is:

```text
apps/cli -> packages/config + packages/git-adapter + packages/project-memory + packages/review-engine + packages/store-sqlite + apps/server
apps/server -> packages/config + packages/contracts + packages/project-memory + packages/review-engine + packages/store-sqlite
apps/mcp-server -> packages/config + packages/contracts + official MCP SDK
apps/dashboard -> packages/contracts
packages/project-memory -> packages/contracts + inward-facing Git/persistence interfaces
packages/store-sqlite -> packages/contracts + better-sqlite3 + Drizzle
packages/review-engine -> packages/domain + packages/contracts + policy types
packages/git-adapter -> packages/contracts
packages/github-gh -> packages/contracts + execa
packages/contracts -> packages/domain
packages/testkit -> packages/domain
```

The `domain` package owns public entities and the rule that only a hard deterministic finding can produce `BLOCK`. `contracts` owns strict Zod shapes and their generated JSON Schemas. The review engine owns policy behavior. CLI, HTTP, and React are presentation/composition adapters and do not redefine verdict logic.

`git-adapter` resolves the selected repository, verifies the canonical top level, and returns a strict repository snapshot. Its Phase 2 worktree provider combines staged and unstaged changes relative to `HEAD` with untracked files, validates every path, applies ignore layers, and caps all content before returning an internal ChangeSet. Every Git call uses `execa` with an executable and argument array.

`review-engine` is pure after its inputs are supplied. It sorts files, calculates metrics, evaluates change-size, source/test, risk-zone, added-relative-import, and protected-path rules, then delegates final verdict assembly to `domain`. It returns ReviewRun v1 with bounded change summaries; inspected added lines never enter that contract. See [review-pipeline.md](review-pipeline.md).

`project-memory` normalizes repository identity, reads bounded tracked metadata, selected Markdown/ADR/policy content, and recent commit metadata through an inward-facing Git interface, then writes one complete incremental batch. Phase 5 also normalizes bounded GitHub issues, pull requests, comments, and reviews into the same document model. Explicit metadata and curated relationship markers become ordered document links; exact identities and their linked neighbors rank before FTS matches.

`store-sqlite` owns WAL mode, foreign keys, migrations, FTS5 synchronization, exact/linked/lexical search, remote sync cursors, and atomic review persistence. Local re-indexing manages only local source types and cannot delete remote documents. Remote sync upserts only remote documents, preserves valid records from partial batches, advances its cursor only after a complete batch, and ignores stale cursor/document replays. The database lives under machine-local Gatekeeper app data, outside the target repository by default.

`apps/server` remains a foreground-only Fastify adapter. It binds to an ephemeral port on `127.0.0.1`, writes ephemeral connection metadata under machine-local app data, migrates/registers the fixed repository before listening, and exposes authenticated fixed-repository index, GitHub sync, memory-search, worktree/pull-request review, and review-read endpoints. HTTP input cannot select a path, remote, or another repository.

`apps/dashboard` remains a small browser adapter. React Router provides Overview, `/reviews/worktree`, `/reviews/pull-request`, `/reviews/:reviewId`, and `/memory`; TanStack Query owns request state. A shared closure reads bootstrap once and holds the bearer token only in memory. Repository and GitHub excerpts render as bounded plain text; only validated `https://github.com/...` evidence becomes a safe external link.

`apps/mcp-server` is a stdio-only presentation adapter. It reads validated ephemeral service metadata, calls only the recorded loopback origin with native fetch, and exposes six strict local tools. The repository skill owns the Codex workflow; the MCP adapter owns no review, evidence, persistence, or verdict behavior. Review preparation and completion remain in `review-engine`, and the foreground service remains the composition/persistence owner.

`gatekeeper start [path]` composes the same review and Project Memory services used by direct CLI commands. It does not open a browser, daemonize, mutate the repository, make a network request, or call a model.

## Runtime constraints

- Node.js 24 LTS, strict TypeScript ESM, pnpm workspaces, and TypeScript project references.
- No Turborepo; root scripts are sufficient for the hackathon workspace.
- Tests are deterministic and offline.
- Packages are created only in the phase that needs working behavior.

## Phase 5 boundary

Phase 5 adds the read-only `gh` provider, remote Project Memory foundation, and verified CLI/Fastify/MCP/dashboard pull-request composition. The Ghost Change fixture remains inside the active Phase 5 gate until its verified slice lands. There is no GitHub publication, Action, embedding, general architecture graph, second model provider, background worker, permanent decision workflow, or generic plugin system.
