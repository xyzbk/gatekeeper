# Phase 1 execution charter

Status: COMPLETE

## Purpose

This charter is the working prompt for Phase 1. It narrows the canonical hackathon plan into verifiable implementation slices without changing product scope.

## Execution prompt

> Complete Gatekeeper Phase 1 only. Turn the Phase 0 contracts into a trustworthy local product spine: inspect one fixed Git repository safely, run one foreground Fastify service on `127.0.0.1`, authenticate its local API with an ephemeral bearer token, serve one real React dashboard, and expose truthful health and repository status. Work test-first. Keep every boundary strict, every value real, and every dependency justified. Commit and push each completed green slice to `origin/master`. Stop before diff review, policy evaluation, SQLite, FTS5, MCP, GitHub data, or model reasoning.

## Product read

- Surface: local web product for maintainers using Codex, with a hackathon judge able to understand it quickly.
- Primary job: confirm that Gatekeeper is attached to the intended repository and is operating locally and safely.
- Visual direction: calm, precise OpenAI-product inspiration without copied marks, assets, or layouts.
- Design dials: variance 3/10, motion 2/10, density 6/10.
- Design rule: familiar product affordances, restrained color, strong hierarchy, visible focus, and no decorative data.

## Required result

1. `packages/git-adapter` resolves and inspects the requested Git repository with argument-array subprocess calls and no path escape.
2. Shared Zod contracts describe the repository snapshot, health response, status response, bootstrap configuration, service metadata, and error envelope.
3. `apps/server` binds to loopback on an available port, validates Host and Origin, authenticates protected APIs, applies a restrictive CSP, logs only safe operational metadata, and serves the built dashboard.
4. `apps/dashboard` uses React, Vite, React Router declarative mode, TanStack Query, CSS Modules, and CSS custom properties to render real status plus loading, empty, and error states.
5. `gatekeeper start [path]` starts the service in the foreground, writes restrictive machine-local metadata, prints the dashboard URL, and shuts down cleanly.

## Non-negotiable invariants

- The selected repository is fixed at process start. No Phase 1 API accepts a repository path.
- `/health` is unauthenticated and reveals no repository identity or filesystem details.
- Protected API requests use `Authorization: Bearer <token>`.
- The bearer token is created with `node:crypto`, kept in browser memory, and never appears in URLs, local storage, logs, source control, or error messages.
- The server listens only on `127.0.0.1`.
- Host and Origin checks fail closed. Permissive CORS is not enabled.
- Repository content, diffs, tokens, secrets, and private paths are absent from logs.
- Browser-visible repository fields come from the live snapshot. No sample metrics or placeholder status values are allowed.
- Tests do not require network access, GitHub authentication, or an OpenAI key.
- Security and accessibility are not simplified by Ponytail review.

## Green commit boundaries

1. Charter and exact Phase 1 scope.
2. Status contracts and Git snapshot adapter.
3. Local service, security controls, metadata, health, and status.
4. Dashboard shell and complete query states.
5. CLI start lifecycle and served-dashboard integration.
6. Phase acceptance, browser review, documentation, and completion report.

Every boundary must pass the affected tests plus root lint, typecheck, test, build, format check, and dependency audit before it is pushed.

## Acceptance evidence

Automated:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
pnpm audit --audit-level high
```

Manual:

- Run `pnpm --filter @gatekeeper/cli start -- start .`.
- Open the printed URL and confirm the current repository values.
- Refresh and confirm the shell still loads.
- Confirm loading, empty, and error behavior through tests and controlled responses.
- Confirm keyboard navigation and visible focus.
- Confirm the browser console is clean.
- Confirm no API accepts an arbitrary path.

## Stop gate

Do not create or begin the review engine, diff extraction, policy evaluation, SQLite storage, FTS5 search, MCP server, GitHub adapter, model reasoning, charts, global state, or a generic plugin system.
