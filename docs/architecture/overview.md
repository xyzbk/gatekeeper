# Architecture overview

Gatekeeper is a local-first, evidence-first repository governance agent. Codex remains the reasoning surface; Gatekeeper owns bounded evidence retrieval and deterministic enforcement.

## Current Phase 2 runtime

```text
CLI review ─┐
            ├─> policy loader ─> bounded Git ChangeSet ─> pure review engine ─> ReviewRun v1
HTTP review ┘                                                        │
                                                                     ├─> CLI text/JSON
                                                                     ├─> local API
                                                                     └─> React Review Inspector
```

The current dependency direction is:

```text
apps/cli -> packages/config + packages/git-adapter + packages/review-engine + apps/server
apps/server -> packages/config + packages/contracts
apps/dashboard -> packages/contracts
packages/review-engine -> packages/domain + packages/contracts + policy types
packages/git-adapter -> packages/contracts
packages/contracts -> packages/domain
packages/testkit -> packages/domain
```

The `domain` package owns public entities and the rule that only a hard deterministic finding can produce `BLOCK`. `contracts` owns strict Zod shapes and their generated JSON Schemas. The review engine owns policy behavior. CLI, HTTP, and React are presentation/composition adapters and do not redefine verdict logic.

`git-adapter` resolves the selected repository, verifies the canonical top level, and returns a strict repository snapshot. Its Phase 2 worktree provider combines staged and unstaged changes relative to `HEAD` with untracked files, validates every path, applies ignore layers, and caps all content before returning an internal ChangeSet. Every Git call uses `execa` with an executable and argument array.

`review-engine` is pure after its inputs are supplied. It sorts files, calculates metrics, evaluates change-size, source/test, risk-zone, added-relative-import, and protected-path rules, then delegates final verdict assembly to `domain`. It returns ReviewRun v1 with bounded change summaries; inspected added lines never enter that contract. See [review-pipeline.md](review-pipeline.md).

`apps/server` remains a foreground-only Fastify adapter. It binds to an ephemeral port on `127.0.0.1`, writes ephemeral connection metadata under machine-local app data, serves the built dashboard, and exposes health, bootstrap, status, and authenticated worktree-review endpoints. The review endpoint calls one injected function already bound to the startup repository. HTTP input cannot select a different repository.

`apps/dashboard` remains a small browser adapter. React Router provides Overview and `/reviews/worktree`; TanStack Query manages the status query and review mutation. A shared closure reads bootstrap once and holds the bearer token only in memory. Review states are explicit: ready, pending, retryable error, and completed. The result renders only the strict ReviewRun contract.

`gatekeeper start [path]` composes the same `runWorktreeReview` function used by direct CLI review. It does not open a browser, daemonize, mutate the repository, persist a review, or call a model.

## Runtime constraints

- Node.js 24 LTS, strict TypeScript ESM, pnpm workspaces, and TypeScript project references.
- No Turborepo; root scripts are sufficient for the hackathon workspace.
- Tests are deterministic and offline.
- Packages are created only in the phase that needs working behavior.

## Phase 2 boundary

Phase 2 is complete and reviews are intentionally ephemeral. There is no SQLite database, Project Memory, FTS5 index, MCP server, Codex skill, GitHub synchronization, pull-request review, or model reasoning. Those packages and adapters are not created early.
