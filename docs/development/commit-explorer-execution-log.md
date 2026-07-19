# Commit Explorer execution log

## Scope

This is a user-authorized post-freeze dashboard extension. It lets a maintainer browse bounded local commit metadata for the repository fixed when the foreground service starts, then use the existing immutable historical-review operation. It does not add multi-project selection, a GitHub read/write path, a new CLI/MCP command, a model path, a database migration, a dependency, source/diff storage, or a target-repository mutation.

## Plan and boundaries

- The approved execution order is in `docs/superpowers/plans/2026-07-19-commit-explorer.md`.
- Git owns local branch membership and commit ordering; Project Memory contributes only repository-scoped indexed and reviewed booleans for an already-bounded SHA batch.
- `master` is preferred when present; the checked-out branch is the fallback. Browser-provided refs are accepted only after exact local-branch validation.
- The API exposes at most 24 full-SHA/title/authored-time records and a bounded numeric cursor. It returns no commit body, diff, review JSON, database path, repository path, remote, or source text.

## Task 1 — strict contracts and read-only local Git discovery

- RED: the new Commit Explorer contract and local Git discovery tests initially failed because neither the schemas nor branch/page adapter methods existed.
- GREEN: strict request/response contracts, a 500-branch cap, a 24-card response cap, bounded cursors, and local-only Git `for-each-ref`/`log` reads are covered by temporary-repository tests.
- Correction: `for-each-ref` emits a line-feed after NUL-delimited records on Windows Git. The parser now discards whitespace-only fragments rather than treating them as a branch name. The command remains an argument-array read with a `refs/heads/` ref, never a checkout/switch/write operation.
- Evidence: `f39097c` after focused contracts/Git-adapter tests and the full quality gate.

## Task 2 — Project Memory join and local API

- RED: storage, Project Memory, application, and server tests first failed because neither the bounded commit-state query nor the `/v1/commits/explore` route existed.
- GREEN: parameterized SQLite queries return indexed/reviewed flags only for the selected repository and exact immutable commit target key. The server rejects an unavailable branch through the existing bounded `404 NOT_FOUND` envelope.
- Security boundary: no migration was needed; the composition validates live local branches, scans bounded Git batches, and returns compact plain metadata only.
- Evidence: `b67c3c5` after focused tests, lint, typecheck, full test suite, build, and formatting checks.

## Task 3 — dashboard route

- RED: client and route tests failed as expected because `MemoryClient.exploreCommits` and `CommitExplorerRoute` did not exist. The failing state was not committed.
- GREEN: `/commits` uses the existing ephemeral bootstrap bearer token only in request headers; it defaults to all local commits, retains filters while moving through cursor pages, maps stale branches to a controlled recovery state, and hands a full SHA to the existing review-start mutation.
- Correction: TypeScript exposed two integration mismatches before release: a `commit_range` operation identifies the immutable commit as `head`, not `sha`; and a nullable API cursor must be narrowed before it enters the React state updater. Both are now strict compile-time invariants.
- Accessibility correction: the source selector was changed from ARIA-only radio buttons to native radio inputs so standard keyboard radio behavior and focus handling remain intact.
- Evidence: `c0656e3` after lint, typecheck, 47 dashboard tests, production dashboard build, formatting, and diff checks.

## Verification environment

- Full repository tests use an isolated temporary directory. This Windows host contains thousands of stale `gatekeeper-*` temporary entries that cannot be removed under the current command policy; reusing that directory makes real Git/SQLite/Fastify tests unreliable. The isolation changes test process environment only and does not alter Gatekeeper runtime paths or target repositories.
- Browser automation was unavailable for this extension, and the user-owned active foreground Gatekeeper service was not stopped or replaced. The responsive layout therefore received static CSS/module and interaction-test verification rather than a new live-service browser session.

## Final verification

- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- Isolated-temp `pnpm test`: PASS — 51 files, 313 tests.
- `pnpm build`: PASS.
- `pnpm format:check`, `pnpm audit --audit-level high`, and `git diff --check`: PASS.

## Intentional limits

- One fixed local repository and its currently local branches only; no project picker, remote history, author filter, total-count promise, or whole-history browser load.
- No GitHub request, publication, model call, CLI/MCP extension, background worker, cache, or generic repository abstraction.
- The ten-row Memory history grid remains separate from Commit Explorer and continues to show indexed history only.
