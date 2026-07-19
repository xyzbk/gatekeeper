# Historical Commit Review and Recent Memory Evidence Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task and Ponytail at full intensity for every coding task. Do not use brainstorming. Work directly on `master` only after the user explicitly authorizes execution. Each passing task is an intentional commit pushed to `origin/master`; never push a red or partial state.

**Goal:** Let a user or Codex select one indexed historical commit, run Gatekeeper's real deterministic review against that commit, and inspect the persisted verdict and Project Memory evidence from a default ten-row history grid.

**Architecture:** Add one vertical capability: a full immutable commit SHA is resolved and diffed against its first parent without checkout, then passed through the existing policy engine, persistence, review operation, inspector, MCP completion, and evidence-timeline paths. Project Memory's existing `commits` table supplies the ten newest rows; there is no new table, migration, repository browser, or project selector. The Memory page shows those rows by default, replaces them with search results after a submitted query, and restores them when search is cleared.

**Tech Stack:** Existing Node.js 24, TypeScript strict ESM, Git argument arrays through `execa`, Zod contracts, Fastify, SQLite/better-sqlite3, React, React Router, TanStack Query, CSS Modules, MCP TypeScript SDK, Vitest, and Playwright Chromium. Add no dependency.

## Global constraints

- This is a user-requested post-freeze plan. Planning does not unfreeze the release; implementation requires a later explicit instruction.
- Implement only single historical-commit review and the ten-row recent-commit Memory surface. Do not add project selection, staged/branch/range UI, pagination, commit graphs, author avatars, analytics, settings, or GitHub writes.
- A commit review means the selected commit versus its first parent. A root commit is compared with Git's algorithm-appropriate empty tree. Merge commits also use the first parent and disclose that rule in the UI/docs.
- Accept only a complete lowercase Git object ID matching `^[0-9a-f]{40,64}$`. The adapter must still verify that it resolves to a commit in the fixed local repository.
- Use the current checked-out `.gatekeeper/policies.yaml` and ignore rules to evaluate historical changes. Do not execute policy or repository content.
- Never checkout, reset, stash, clean, commit, or otherwise mutate the target repository. Invoke Git with argument arrays, `shell: false`, bounded output, ignored stdin, and the existing 30-second timeout.
- Preserve existing limits: at most 500 changed paths, 500 inspected added lines per file, 2,000 characters per added line, and 2 MiB of Git diff output.
- Never return or log raw diffs, source files, tokens, private exception text, or Git stderr. Commit titles and evidence remain bounded untrusted repository content rendered as text.
- Deterministic hard policy remains the only authority capable of `BLOCK`. Commit review must reuse the existing engine rather than add verdict logic to CLI, HTTP, MCP, storage, or React.
- Default tests remain network-free and require no GitHub authentication or OpenAI key.
- Every behavior task starts RED, becomes GREEN with the smallest implementation, runs its focused checks, updates the execution log, then commits and pushes before the next task.

---

### Task 1: Freeze the commit-review and recent-history contracts

**Files:**

- Modify: `packages/domain/src/change.ts`
- Modify: `packages/contracts/src/change.ts`
- Modify: `packages/contracts/src/change.test.ts`
- Modify: `packages/contracts/src/review.ts`
- Modify: `packages/contracts/src/review.test.ts`
- Modify: `packages/contracts/src/memory.ts`
- Modify: `packages/contracts/src/memory.test.ts`
- Create: `docs/development/historical-commit-review-execution-log.md`
- Modify: `docs/progress.md`

**Interfaces:**

- `commitReviewInputSchema`: strict `{ schemaVersion: 1, sha: fullCommitSha }`.
- `ChangeSet.target`: add `{ kind: 'commit_range', display, base?, head }`; `head` and optional `base` are full object IDs.
- `recentCommitEvidenceSchema`: strict `{ sha, authoredAt, title }` derived from the already bounded indexed commit record.
- `recentCommitEvidenceResponseSchema`: strict `{ schemaVersion: 1, commits }` with at most ten items.

```ts
export const commitReviewInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    sha: z.string().regex(/^[0-9a-f]{40,64}$/),
  })
  .strict();

export const recentCommitEvidenceSchema = gitCommitRecordSchema
  .pick({ sha: true, authoredAt: true, title: true })
  .strict();
```

- [ ] Create the execution log with the approved scope, first-parent semantics, current-policy semantics, trust boundary, planned RED/GREEN commands, and a clear statement that this is a controlled post-freeze feature rather than a release-blocking correction.
- [ ] Add failing contract tests for a valid commit target/input/history response and for short SHA, uppercase SHA, option-like input, missing `head`, an eleventh history item, extra properties, and malformed timestamps.
- [ ] Run `pnpm vitest run --config vitest.workspace.ts packages/contracts/src/change.test.ts packages/contracts/src/review.test.ts packages/contracts/src/memory.test.ts`; expect RED because the schemas and `commit_range` `ChangeSet` target do not exist.
- [ ] Add only the strict schemas, inferred types, API JSON schemas, and the `ChangeSet` domain union member. Do not introduce a generic review-target factory or change the broad existing `ReviewTarget` vocabulary.
- [ ] Update `docs/progress.md` to mark the post-freeze extension as planned/active without claiming implementation.
- [ ] Run the focused contract tests, `pnpm --filter @gatekeeper/contracts typecheck`, Prettier on touched files, and `git diff --check`.
- [ ] Commit `feat: define historical commit review contracts` and push `master`.

### Task 2: Extract and review one commit without touching the worktree

**Files:**

- Modify: `packages/git-adapter/src/worktree-diff.ts`
- Modify: `packages/git-adapter/src/worktree-diff.test.ts`
- Create: `packages/git-adapter/src/commit-diff.test.ts`
- Modify: `packages/git-adapter/src/git-provider.ts`
- Modify: `packages/review-engine/src/review-worktree.ts`
- Modify: `packages/review-engine/src/review-worktree.test.ts`
- Create: `apps/cli/src/commit-review.ts`
- Create: `apps/cli/src/commit-review.test.ts`
- Modify: `docs/development/historical-commit-review-execution-log.md`

**Interfaces:**

- `GitProvider.getCommitDiff(repositoryPath, sha, options?) -> Promise<ChangeSet>`.
- `reviewCommit(input: ReviewChangeSetInput) -> ReviewRun`; it accepts only `commit_range` and delegates unchanged deterministic evaluation to `reviewChangeSet`.
- `runCommitReview(repositoryPath, sha, dependencies?, context?) -> Promise<ReviewRunContract>`.

The adapter should reuse the existing tracked-diff parsing/limits inside `worktree-diff.ts`, not copy a second parser. Resolve the selected object and base before issuing the same three bounded diff commands:

```ts
const selected = requireCommitSha(inputSha);
const head = await resolveCommit(repositoryRoot, selected, runGit);
const parents = await readCommitParents(repositoryRoot, head, runGit);
const base = parents[0] ?? (await readEmptyTree(repositoryRoot, runGit));

// Every Git call remains an argument array. No interpolation and no checkout.
const range = [base, head, '--'] as const;
```

- [ ] Write failing adapter tests for a normal two-commit repository, root commit, merge commit first-parent behavior, rename, deletion, binary file, ignored path, missing object, non-commit object, malformed SHA rejected before Git, over-500 paths, and over-limit output.
- [ ] In the real-repository tests, record `HEAD`, branch, index tree, and porcelain status before extraction and require exact equality afterward.
- [ ] Run `pnpm vitest run --config vitest.workspace.ts packages/git-adapter/src/commit-diff.test.ts packages/git-adapter/src/worktree-diff.test.ts`; expect RED because `getCommitDiff`/commit extraction do not exist.
- [ ] Refactor only the already-present tracked diff collection into a private shared function in `worktree-diff.ts`; keep worktree-only untracked file handling in `extractWorktreeDiff`. Add `--no-ext-diff` and `--no-textconv` to historical diff calls and preserve all current caps/path checks.
- [ ] Write failing engine tests proving a commit target receives the same protected-path, relationship-test, risk-zone, import-boundary, size, metric, and verdict behavior as a worktree target, and that non-commit targets are rejected.
- [ ] Add the minimal `reviewCommit` wrapper and the CLI application function that loads current policy, obtains the immutable `ChangeSet`, invokes the engine, and parses the result contract.
- [ ] Run focused adapter/engine/CLI tests, package typechecks, Prettier, and `git diff --check`. Record any platform-specific Git behavior and its correction in the execution log.
- [ ] Commit `feat: review immutable historical commits` and push `master`.

### Task 3: Persist commit reviews and expose CLI/local API operations

**Files:**

- Modify: `apps/cli/src/project-memory.ts`
- Modify: `apps/cli/src/project-memory.test.ts`
- Modify: `apps/cli/src/index.ts`
- Modify: `apps/cli/src/start.ts`
- Modify: `apps/cli/src/start.test.ts`
- Modify: `apps/server/src/service.ts`
- Modify: `apps/server/src/server.ts`
- Modify: `apps/server/src/server.test.ts`
- Modify: `apps/server/src/ghost-change.integration.test.ts`
- Modify: `demo/judge-demo.ts`
- Modify: `demo/judge-demo.test.ts`
- Modify: `tests/e2e/ghost-change.spec.ts`
- Modify: `docs/development/historical-commit-review-execution-log.md`

**Interfaces:**

- CLI: `gatekeeper review commit <full-sha> [path] [--format human|json]`.
- Synchronous local API: `POST /v1/reviews/commit` with `CommitReviewInput`, returning `ReviewRun`.
- Dashboard operation API: `POST /v1/reviews/commit/start` with the same body, returning `202 ReviewOperation`.
- `StartGatekeeperServiceOptions.reviewCommit(sha, context)` and matching server callbacks.

```ts
const target = {
  kind: 'commit_range' as const,
  display: `Commit ${sha.slice(0, 12)}`,
  head: sha,
};
```

- [ ] Add failing Project Memory command tests proving a commit review registers the inspected repository, uses a prior review only for the same full SHA, persists the result, and cannot collide with another commit or repository.
- [ ] Add failing CLI process/help coverage for valid human/JSON output, invalid/short SHA usage failure, unknown commit environment failure, and a repository path after the SHA.
- [ ] Add failing server/service tests for authenticated sync and async routes, strict request bodies, fixed-repository ownership, queued/running/completed/failed persistence, restart-safe retrieval, previous-review linkage, and redacted failure responses/logs.
- [ ] Run the focused CLI/server tests; expect RED because the command, callbacks, and routes are absent.
- [ ] Wire `review commit` through the existing Project Memory session. Build previous-review identity from `kind + display`; let the returned `ChangeSet` supply the verified `base`/`head`. Save through the existing atomic review path.
- [ ] Wire service startup through the new `runCommitReview` callback in the CLI and update every typed test/demo service constructor. Do not add a second service, worker, route-specific persistence layer, or GitHub synchronization.
- [ ] For the async operation, use only `evaluating_change` then `persisting_review`; set `historySync: null`. Keep the existing persisted detail route and completion pipeline.
- [ ] Run focused tests, `pnpm typecheck`, Prettier, and `git diff --check`. Manually run the built CLI against a temporary two-commit fixture and verify Git status is unchanged.
- [ ] Commit `feat: persist historical commit reviews` and push `master`.

### Task 4: Read the ten newest indexed commits from existing Project Memory

**Files:**

- Modify: `packages/project-memory/src/project-memory.ts`
- Modify: `packages/project-memory/src/project-memory.test.ts`
- Modify: `packages/store-sqlite/src/sqlite-project-store.ts`
- Modify: `packages/store-sqlite/src/sqlite-project-store.test.ts`
- Modify: `apps/server/src/service.ts`
- Modify: `apps/server/src/server.ts`
- Modify: `apps/server/src/server.test.ts`
- Modify: `docs/development/historical-commit-review-execution-log.md`

**Interfaces:**

- `ProjectMemoryPersistence.recentCommits(repositoryId) -> RecentCommitEvidence[]`.
- `ProjectMemory.recentCommits(repositoryId) -> Promise<RecentCommitEvidence[]>`.
- `GET /v1/memory/commits` returns `RecentCommitEvidenceResponse` for the service's fixed repository.

```sql
SELECT sha, authored_at AS authoredAt, title
FROM commits
WHERE repository_id = ?
ORDER BY authored_at DESC, sha DESC
LIMIT 10
```

- [ ] Add failing SQLite tests proving exactly ten maximum rows, newest-first stable order, repository isolation, bounded fields, zero results before indexing, and removal/update behavior after an incremental reindex.
- [ ] Add failing Project Memory and authenticated server tests for the exact response schema, fixed repository, empty list, and rejection of query/body extras.
- [ ] Run focused storage/memory/server tests; expect RED because no recent-commit read surface exists.
- [ ] Implement the single prepared query against the existing `commits` table. Do not add a migration, cache, cursor, page token, author column, or duplicate history table.
- [ ] Expose the fixed ten-row read through Project Memory and the local service. Commit titles are returned as bounded untrusted text; messages and raw diffs are not returned.
- [ ] Run focused tests, package typechecks, Prettier, and `git diff --check`.
- [ ] Commit `feat: expose recent commit evidence` and push `master`.

### Task 5: Add the Memory history grid and one-click commit review

**Files:**

- Modify: `apps/dashboard/src/api/memory-client.ts`
- Modify: `apps/dashboard/src/api/memory-client.test.ts`
- Modify: `apps/dashboard/src/api/review-client.ts`
- Modify: `apps/dashboard/src/api/review-client.test.ts`
- Modify: `apps/dashboard/src/routes/memory-route.tsx`
- Create: `apps/dashboard/src/routes/memory-route.test.tsx`
- Modify: `apps/dashboard/src/routes/review-detail-route.tsx`
- Modify: `apps/dashboard/src/routes/review-detail-route.test.tsx`
- Modify: `apps/dashboard/src/app/dashboard-app.tsx`
- Modify: `apps/dashboard/src/app/dashboard-app.test.tsx`
- Modify: `apps/dashboard/src/main.tsx`
- Modify: `apps/dashboard/src/styles/dashboard.module.css`
- Modify: `docs/development/historical-commit-review-execution-log.md`

**Interfaces and UX:**

- `MemoryClient.recentCommits(signal?)` calls `GET /v1/memory/commits`.
- `ReviewClient.startCommitReview(sha, signal?)` calls `POST /v1/reviews/commit/start`.
- Default `/memory`: search form followed by a semantic table titled `Recent commit evidence`, at most ten rows.
- Columns: commit title, twelve-character SHA, authored UTC date, and `Review commit` action.
- A submitted non-empty query replaces the grid with the existing search loading/error/results states. `Clear search` removes the URL query and restores the grid.
- Selecting a row starts the persisted operation and navigates to `/reviews/:reviewId`; the existing inspector shows verdict, findings, evidence timeline, remediation, comparison, and re-review.

- [ ] Add failing client tests for the recent-commit response, commit start request, strict response parsing, abort propagation, and unavailable/malformed failures.
- [ ] Add failing route tests for initial loading, newest-first ten-row grid, empty history, history error/retry, title rendered as text, keyboard-accessible review action, action failure, navigation after success, search replacing the grid, direct `?query=` load, and clear-search restoration.
- [ ] Add failing review-detail tests proving a completed commit review can re-review its `target.head` and a failed commit operation returns to `/memory`, not the worktree page.
- [ ] Run focused dashboard tests; expect RED because the clients, props, grid, and commit action do not exist.
- [ ] Implement two independent TanStack Query states: history is enabled only when no submitted query exists; search is enabled only when one exists. Use a single per-page commit mutation and disable review actions while it is pending.
- [ ] Render a real `<table>` with caption/headers and a compact responsive wrapper. Keep the established graphite/OpenAI-inspired palette, IBM Plex Sans, spacing, focus ring, reduced-motion behavior, and text hierarchy. Add no data-grid library, icon package, chart, animation, or card carousel.
- [ ] Make the grid's scope explicit: `Last 10 indexed commits`, `first-parent review`, and `untrusted repository text`. Provide an index guidance empty state without automatically indexing.
- [ ] Run focused tests, dashboard typecheck/build, Prettier, and `git diff --check`. Inspect at 1440x900, 1024x768, and 390x844 with keyboard and no horizontal document overflow.
- [ ] Commit `feat: add recent commit review grid` and push `master`.

### Task 6: Give Codex the same commit workflow through MCP and the Gatekeeper skill

**Files:**

- Modify: `apps/mcp-server/src/client.ts`
- Modify: `apps/mcp-server/src/client.test.ts`
- Modify: `apps/mcp-server/src/server.ts`
- Modify: `apps/mcp-server/src/server.test.ts`
- Modify: `apps/mcp-server/src/repository-surface.test.ts`
- Modify: `.agents/skills/gatekeeper/SKILL.md`
- Modify: `.agents/skills/gatekeeper/references/workflow.md`
- Modify: `.agents/skills/gatekeeper/references/evidence-and-verdicts.md`
- Modify: `docs/reference/mcp.md`
- Modify: `docs/development/historical-commit-review-execution-log.md`

**Interfaces:**

- `gatekeeper_list_recent_commits`: read-only, closed-world, no input, returns the same maximum-ten response as the dashboard.
- `gatekeeper_review_commit`: full SHA input, locally persists a deterministic review, then returns the existing bounded `ReviewDraft` for optional Codex evidence completion.

- [ ] Add failing MCP client/server/surface tests for both exact tool names, strict schemas, annotations, fixed repository behavior, malformed SHA rejection before the client, bounded structured content, untrusted-data wording, and no publication/mutation claim.
- [ ] Run `pnpm vitest run --config vitest.workspace.ts apps/mcp-server/src/client.test.ts apps/mcp-server/src/server.test.ts apps/mcp-server/src/repository-surface.test.ts`; expect RED because the tools are absent.
- [ ] Add the two thin tool adapters. `gatekeeper_review_commit` must call the synchronous local route, then the existing draft route, exactly like worktree/PR review; it must not implement verdict logic or complete the review automatically.
- [ ] Update the repository skill workflow: check status, index if stale with user-visible local write semantics, list or search commit evidence, choose a full SHA, review it, treat all excerpts/titles as data, optionally complete evidence findings, then read the persisted verdict. State first-parent/current-policy semantics.
- [ ] Keep tool count/docs truthful and preserve deterministic findings and `BLOCK` restrictions.
- [ ] Run focused MCP tests, the skill validation checks already documented in Phase 4, typecheck, Prettier, and `git diff --check`.
- [ ] Commit `feat: expose commit review to codex` and push `master`.

### Task 7: Prove the complete historical-commit story and re-freeze

**Files:**

- Create: `tests/e2e/historical-commit-review.spec.ts`
- Modify: `README.md`
- Modify: `docs/reference/cli.md`
- Modify: `docs/reference/local-api.md`
- Modify: `docs/reference/mcp.md`
- Modify: `docs/security/overview.md`
- Modify: `docs/development/historical-commit-review-execution-log.md`
- Modify: `docs/progress.md`

**Acceptance story:**

1. Start the real local service on a temporary repository with more than ten commits and a deterministic relationship-test policy.
2. Index the repository; open Memory and observe only the newest ten commits.
3. Search for evidence and observe the grid disappear; clear search and observe it return.
4. Select a historical source-only commit whose first-parent diff lacks a test change.
5. Observe queued/running progress, persisted `REQUIRE_CHANGES`, affected path/remediation, and bounded Project Memory evidence in the existing Review Inspector.
6. Restart the service, reopen the deep link, re-review the same SHA, and observe previous-review comparison.
7. Confirm the repository's branch, `HEAD`, index tree, worktree status, and tracked files are unchanged.

- [ ] Write the Playwright test first and run `pnpm build && pnpm playwright test tests/e2e/historical-commit-review.spec.ts`; expect RED at the missing history/commit-review surface.
- [ ] Make only integration corrections required by the acceptance story. Do not add a demo-only production route or mock the browser API.
- [ ] Run targeted attack tests for SHA option injection, unknown/non-commit object, root/merge commits, poisoned titles, oversized diff, path traversal/symlink containment, secret/log redaction, unauthenticated/foreign-origin HTTP, cross-repository storage access, and an inferred finding attempting `BLOCK`.
- [ ] Update README and reference/security docs with exact CLI/API/MCP commands, ten-row indexed-history semantics, first-parent/current-policy behavior, no-checkout guarantee, trust boundary, failure repairs, and explicit non-goals.
- [ ] Run `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm playwright test`, `pnpm demo:smoke`, `pnpm eval`, `pnpm model-data:dry-run`, `pnpm format:check`, `pnpm audit --audit-level high`, and `git diff --check`.
- [ ] Run Ponytail over the complete feature diff. Remove any new dependency, duplicated parser, generic target abstraction, pagination layer, commit-browser state machine, or decorative UI that is not essential to the acceptance story.
- [ ] Record every RED/GREEN result, failure, correction, manual viewport result, security outcome, and remaining limitation in the execution log. Update `docs/progress.md` with commit traceability and re-establish code freeze.
- [ ] Commit `docs: complete historical commit review` and push `master`; confirm local `master` and `origin/master` match, then stop.

## Explicit non-goals

- Multiple active projects or a repository selector.
- Arbitrary revision expressions, abbreviated SHAs, branch/staged review, multi-commit range review, commit graph browsing, pagination, filtering, or sorting controls.
- Author identity, avatars, signatures, blame, file-content viewer, raw patch viewer, or source checkout.
- Automatic indexing on page load or background polling for new commits.
- GitHub App installation, webhooks, commit comments/checks, branch protection, publishing, or any target-repository write.
- New model calls, semantic embeddings, model-generated verdicts, or automatic evidence completion.

## Self-review

- **User intent:** The plan adds only historical commit review and the default ten-row Memory history grid. Search replaces the grid and clear restores it. Project selection remains deferred.
- **Power, not decoration:** Dashboard, CLI, local API, MCP, skill, deterministic engine, persistence, evidence timeline, remediation, re-review, and restart-safe deep links all share one commit capability.
- **Ponytail audit:** Existing commit storage, diff parsers, policy engine, operations, inspector, and draft/completion pipeline are reused. The only new public data is one strict input, one ten-item response, two HTTP routes, one CLI command, and two MCP tools. No dependency or migration is added.
- **Safety:** Full SHA validation, commit-object verification, first-parent semantics, immutable Git reads, bounded output, current policy, repository isolation, plain-text rendering, redacted failures, and deterministic-only `BLOCK` authority are explicit acceptance conditions.
- **Execution gate:** This document is planning only. No task above may begin until the user explicitly authorizes implementation of this post-freeze feature.

## Execution prompt

> Read `GATEKEEPER_COMPLETE_CODEX_SPEC.md`, `gatekeeper_codex_build_pack/GATEKEEPER_HACKATHON_PHASED_EXECUTION_PLAN.md`, `docs/progress.md`, and this plan. Treat this plan as a user-authorized post-freeze extension only if the user explicitly says to execute it. Use `executing-plans`, test-first development, and Ponytail at full intensity; do not use brainstorming. Execute one task at a time, record RED/GREEN evidence and failures, run the listed focused checks, commit and push each passing task to `origin/master`, and stop after Task 7 re-establishes code freeze. Do not add project selection or any explicit non-goal.
