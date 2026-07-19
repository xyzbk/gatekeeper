# Commit Explorer implementation plan

> **For Codex:** execute this plan step by step using test-first development. Commit and push each passing step to `origin/master`; do not start another step while the current one is red.

**Goal:** Add a compact, local-only Commit Explorer at `/commits` so a maintainer can browse a selected local branch, narrow the history, see whether a commit is indexed or has been reviewed, and begin the existing immutable commit-review flow.

**Architecture:** Keep Git as the source of branch membership and commit ordering. A bounded local Git page is joined at read time with two existing SQLite facts: whether a commit is indexed by Project Memory and whether an immutable `commit_range` review exists. The server owns that composition behind one authenticated local API; the React route consumes the stable contract. Project Memory's existing ten-row Memory-page grid remains unchanged.

**Tech stack:** Existing strict TypeScript ESM workspace; Zod 4 contracts; Fastify; native `git` via the existing execa argument-array adapter; SQLite/better-sqlite3; React, React Router, TanStack Query, CSS Modules, and Vitest/Testing Library. No dependency, migration, GitHub request, model call, CLI command, MCP tool, global state library, or component library is added.

## Scope and safety boundary

This is an explicitly approved, post-freeze dashboard extension. It stays within Gatekeeper's local-first, fixed-repository model:

- The service still serves exactly one repository fixed at start-up. This is not a project picker or multi-repository dashboard.
- It reads local branch refs and commit metadata only. It never checks out, switches, creates, deletes, fetches, resets, stages, or otherwise mutates the target repository.
- It never sends a request to GitHub, stores source/diff bodies, accepts a repository path from the browser, or changes the existing Codex/MCP/CLI surfaces.
- A card starts the already-existing `POST /v1/reviews/commit/start` operation with the full immutable SHA. It does not create a second review pipeline.
- Repository-derived titles remain inert plain text. The API returns only bounded metadata and boolean local-state markers.
- Project Memory mode means **commits indexed in the existing local Project Memory database that also belong to the selected local branch at read time**. No schema migration or historical branch-association backfill is required.

## Contract and pagination decisions

Add a strict, versioned `CommitExplorerInput` and `CommitExplorerResponse` to `packages/contracts/src/memory.ts` and export their JSON schemas/types. The input contains an optional branch request plus source (`all_local` or `project_memory`), optional title/full-SHA query, optional authored-from/authored-through ISO date, review state (`all`, `reviewed`, `not_reviewed`), sort (`newest`, `oldest`), and an opaque numeric cursor. The response contains the resolved branch, bounded local branch names, the applied selection, at most 24 metadata records, and an optional next cursor.

The server chooses `master` when it exists; when it does not, it uses the currently checked-out branch. A requested branch must exactly match the current local-ref list. This protects the Git adapter from using browser-provided revision syntax and makes deletion/race failures explicit.

The cursor is a bounded candidate offset, not a total-count promise. For each request, the application scans local Git in fixed-size metadata batches until it fills 24 matching cards or reaches the bounded end of that request. The response carries only the next offset; the UI keeps its own previous-cursor stack for Prev. This is stable enough for a live local repository without reading whole history into the browser, while a moving branch naturally refreshes from current Git truth.

## Step 1: Define and test safe, bounded commit discovery

**Files:**

- Modify: `packages/contracts/src/memory.ts`
- Modify: `packages/contracts/src/memory.test.ts`
- Modify: `packages/git-adapter/src/project-memory-source.ts`
- Modify: `packages/git-adapter/src/project-memory-source.test.ts`
- Modify: `packages/git-adapter/src/git-provider.ts`
- Modify: `packages/git-adapter/src/git-provider.test.ts`

1. Write RED contract tests that accept the complete explorer request/response, reject unknown keys, invalid dates/cursors, overlong queries, incomplete SHAs, and more than 24 cards or 500 branches.
2. Add named local-branch and commit-page types and schemas without changing `RecentCommitEvidence`; that existing ten-item contract must remain byte-for-byte compatible.
3. Write RED Git-adapter tests using temporary repositories and recording `RunGit` implementations. Cover deterministic local-ref listing, branch commit pages ordered newest/oldest, ISO date bounds, cursor/limit bounds, malformed NUL records, command/output failure, and the fact that all commands are argument arrays and none is `checkout`/`switch`/write-capable.
4. Implement `listLocalBranches` with `for-each-ref` and a hard record/output cap. Implement an immutable branch-page reader with `git log`, a full `refs/heads/...` ref selected only from the listed local refs, `--skip`, bounded `--max-count`, optional date arguments, and the existing NUL-delimited parser. Keep the indexing-only `listCommits(root, limit)` behavior unchanged.
5. Extend `GitProvider` narrowly with those two read-only methods and retain its existing adapter factory.
6. Run focused contracts and Git-adapter tests, then `pnpm lint`, `pnpm typecheck`, and `pnpm test`. Commit and push only after all pass.

## Step 2: Join existing Project Memory state and expose one local API

**Files:**

- Modify: `packages/project-memory/src/project-memory.ts`
- Modify: `packages/project-memory/src/project-memory.test.ts`
- Modify: `packages/store-sqlite/src/sqlite-project-store.ts`
- Modify: `packages/store-sqlite/src/sqlite-project-store.test.ts`
- Add: `apps/server/src/commit-explorer.ts`
- Add: `apps/server/src/commit-explorer.test.ts`
- Modify: `apps/server/src/service.ts`
- Modify: `apps/server/src/server.ts`
- Modify: `apps/server/src/server.test.ts`
- Modify: `docs/reference/local-api.md`

1. Write RED store tests for a bounded SHA batch: indexed flag, reviewed flag from the exact `commit:<full-sha>` target key, repository isolation, duplicate input safety, and no result for non-commit reviews. Do not add a table or migration.
2. Add a narrow persistence/Project Memory method that returns the two booleans for a bounded list of full SHAs. Use SQL parameters for every SHA and query only the existing `commits` and `review_runs` tables.
3. Write RED application-service tests for master preference, current-branch fallback, unavailable branch rejection, query/date/sort filtering, Project Memory-only filtering, reviewed/not-reviewed filtering, 24-card fill across bounded Git batches, cursor continuation, and the absence of any Git mutation command.
4. Implement `apps/server/src/commit-explorer.ts` as a small application composition function. It validates the resolved branch against the local-ref list, requests bounded Git metadata pages, asks Project Memory for matching local-state flags, filters plain metadata, and returns the strict contract. It must cap cursor depth/candidate scanning and return no raw commit message, source, diff, review JSON, or database path.
5. Add an authenticated `POST /v1/commits/explore` endpoint with shared body/response schemas. A stale/unavailable selected branch returns the existing bounded `NOT_FOUND` envelope so the UI can show a branch-specific recovery state; all other validation stays `USAGE_ERROR`.
6. Wire the application function from the fixed-repository service after its existing identity check. Keep `GET /v1/memory/commits` and the historical review endpoint unchanged.
7. Run focused storage, Project Memory, application, and server tests, then the full quality gate. Commit, push, and wait for the pushed CI run to pass before Step 3.

## Step 3: Build the compact Commit Explorer route

**Files:**

- Modify: `apps/dashboard/src/api/memory-client.ts`
- Modify: `apps/dashboard/src/api/memory-client.test.ts`
- Add: `apps/dashboard/src/routes/commit-explorer-route.tsx`
- Add: `apps/dashboard/src/routes/commit-explorer-route.test.tsx`
- Modify: `apps/dashboard/src/app/dashboard-app.tsx`
- Modify: `apps/dashboard/src/app/dashboard-app.test.tsx`
- Modify: `apps/dashboard/src/components/app-shell.tsx`
- Modify: `apps/dashboard/src/styles/dashboard.module.css`

1. Write RED client tests proving the explorer sends the strict JSON request only to `/v1/commits/explore`, uses the ephemeral bearer token only in headers, parses the shared response contract, and maps a 404 to an unavailable-branch error without exposing response content.
2. Add `MemoryClient.exploreCommits`; reuse the current bootstrap mechanism and never persist the token or repository selection in browser storage.
3. Write RED route tests for default master data, branch selection, source toggle, applied text/SHA/date/review/sort filters, next/previous cursor behavior, Project Memory empty state, no-filter-result state, branch-unavailable recovery, generic retryable API failure, 24-card semantic rendering, and clicking one card to call the existing full-SHA review mutation then navigate to `/reviews/:reviewId`.
4. Implement `/commits` with a restrained left-aligned three-column record grid on wide screens, two columns on medium screens, and one on narrow screens. Use native labelled selects/date/search controls and an accessible segmented source control. State changes are applied deliberately through one form submission; source/branch/filter changes reset cursor history. The full card is the accessible review action; there is no details rail or duplicate review implementation.
5. Add a concise `Commits` navigation link. Preserve `/memory` as evidence search with its current last-ten indexed history grid.
6. Add only the CSS needed for a thin-border dark graphite record grid, compact metadata, source/review state labels, skeleton cards, pagination controls, and responsive filter layout. Reuse the existing palette, IBM Plex Sans, focus treatment, and motion conventions; no gradients, glowing effects, artificial metrics, custom icons, or dependency-driven components.
7. Run dashboard unit tests and the full quality gate. Build the dashboard and inspect `/commits` at desktop and 375-pixel widths for readable controls, keyboard focus, no page-wide horizontal overflow, no console errors, and correct empty/error states. Commit, push, and wait for CI.

## Step 4: Document the extension and close its verification record

**Files:**

- Modify: `docs/progress.md`
- Modify: `docs/reference/local-api.md` (if Step 2 did not complete its final wording)
- Add: `docs/development/commit-explorer-execution-log.md`

1. Record the extension as a post-freeze dashboard enhancement, its exact safety boundary, no-migration decision, test-first RED evidence, any failure/correction, commands/results, manual responsive inspection, and intentional limits (one fixed repository, local branches only, no whole-history count, no author filter, no GitHub/mutation).
2. Run the release-quality matrix exactly: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check`, and `pnpm audit --audit-level high`.
3. Run `git diff --check`, inspect the staged diff and status, commit the documentation only after every check passes, push `master`, and confirm the corresponding GitHub Actions run is green.

## Final acceptance checklist

- [ ] `/commits` defaults to `master` when available and otherwise to the checked-out branch.
- [ ] A branch selector lists only current local branches and cannot change the target checkout.
- [ ] All-local and Project Memory modes share source, query, authored-date, review-status, and sort filters.
- [ ] The server returns no more than 24 cards and supports Next/Prev without loading all history in the browser.
- [ ] Project Memory mode reflects existing indexed records that still belong to the selected branch; no schema migration was introduced.
- [ ] Every card starts the existing strict full-SHA historical review and routes to its existing persisted result.
- [ ] Memory's evidence search and last-ten grid still work unchanged.
- [ ] Invalid/deleted branch, loading, empty, no-match, and review-start errors are explicit, bounded, and recoverable.
- [ ] No GitHub/network/model/CLI/MCP functionality, target-repository mutation, or raw source/diff storage was added.
- [ ] Full quality gate, visual responsive review, intentional commits/pushes, and green CI are recorded.
