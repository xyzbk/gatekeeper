# Phase 5: Read-only GitHub History and Ghost Change Implementation Plan

> **Execution:** Work through each task test-first, verify it, commit it, and push it to `origin/master` before starting the next task.

**Goal:** Review one GitHub pull request through the existing local Gatekeeper workflow, retrieve a bounded and explicit historical evidence chain from Project Memory, keep hostile remote text inert, and deliver the Ghost Change as a reproducible offline fixture plus an optional live read-only path.

**Architecture:** A new `github-gh` adapter owns safe `gh` process execution and typed remote parsing. Shared contracts own serialized GitHub, sync, and pull-request inputs and outputs. Project Memory normalizes remote records, persists incremental cursors and explicit document links, and ranks exact references and links before FTS. The existing review engine evaluates a pull-request `ChangeSet`; CLI, Fastify, MCP, and React remain thin adapters. The foreground service remains the only HTTP composition root and SQLite owner.

**Tech Stack:** Node.js 24, TypeScript strict ESM, Zod 4, execa argument arrays, SQLite/Drizzle/FTS5, Fastify 5, Commander, MCP SDK v1.29.0, React 19, TanStack Query, CSS Modules, Vitest, and deterministic JSON fixtures.

**Skills:** Use Writing Plans, Executing Plans, Test-Driven Development, Ponytail at full intensity, JavaScript Expert for the TypeScript/process boundary, How to Write Component for the focused React addition, Gatekeeper for final evidence review, and Verification Before Completion. Use Systematic Debugging only if an unexpected failure appears. Do not use Brainstorming.

**Global constraints:** Execute Phase 5 only. Preserve every Phase 0-4 contract. No GitHub publication, Action, check, comment, label, merge, close, branch checkout, or repository mutation exists in the production adapter. Do not store tokens. Do not log remote bodies, diffs, tokens, secrets, or private URLs. Repository and GitHub text is untrusted data. Model inference cannot produce `BLOCK`. The demo seeder is isolated, dry-run by default, and may not be applied to GitHub without separate approval for the exact target. Default tests remain network-, auth-, and model-free. Each completed slice passes focused tests and the root quality gate before its intentional commit is pushed.

---

## Task 1: Freeze the corrected Phase 5 contract and evidence log

**Files:**

- Modify: `gatekeeper_codex_build_pack/GATEKEEPER_HACKATHON_PHASED_EXECUTION_PLAN.md`
- Create: `docs/superpowers/plans/2026-07-18-phase-5-github-ghost-change.md`
- Create: `docs/development/phase-5-execution-log.md`

1. Record that sync/review commands accept a local repository path, while the provider resolves its normalized GitHub remote.
2. Separate deterministic CLI review from the Codex-authored completion conclusion.
3. Record that seeder implementation is not authorization to mutate GitHub.
4. Record baseline quality-gate and missing-`gh` evidence.
5. Run Markdown formatting and `git diff --check`.
6. Commit and push the verified Phase 5 execution contract.

## Task 2: Add strict remote contracts and the read-only gh provider

**Files:**

- Modify: `packages/contracts/src/change.ts`
- Create: `packages/contracts/src/github.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/github-gh/package.json`
- Create: `packages/github-gh/tsconfig.json`
- Create: `packages/github-gh/src/github-provider.ts`
- Create: `packages/github-gh/src/github-provider.test.ts`
- Create: `packages/github-gh/src/index.ts`
- Modify: root TypeScript references and lockfile

1. Write failing schemas for normalized GitHub identity, preflight, pull-request metadata, bounded remote records, partial failures, sync limits/cursors, and pull-request `ChangeSet` targets.
2. Write failing provider tests for HTTPS/SSH remote normalization, missing auth repair, strict JSON parsing, bounded timeout/output, pull-request metadata/files, partial malformed history, and safe argument arrays.
3. Implement one injected `RunGh` boundary using `execa('gh', arguments, { shell: false })`, stdin ignored, timeouts, and output caps.
4. Use only documented read commands: `auth status`, `repo view`, `pr view`, and explicit GET `api` endpoints.
5. Prove a production source scan contains no GitHub write subcommand or mutating HTTP method.
6. Run focused tests and the root quality gate; record RED/GREEN evidence.
7. Commit and push.

## Task 3: Persist incremental remote documents and explicit links

**Files:**

- Create: `packages/store-sqlite/drizzle/0001_github_history.sql`
- Modify: `packages/store-sqlite/drizzle/meta/_journal.json`
- Modify: `packages/store-sqlite/src/schema.ts`
- Modify: `packages/store-sqlite/src/sqlite-project-store.ts`
- Modify: `packages/store-sqlite/src/sqlite-project-store.test.ts`
- Modify: `packages/project-memory/src/project-memory.ts`
- Modify: `packages/project-memory/src/project-memory.test.ts`
- Modify: package dependencies as required

1. Write failing migration and persistence tests for repository-scoped sync cursors, atomic remote upserts, stable IDs, unchanged repeat sync, link ownership, and partial batches.
2. Add one versioned migration for `sync_cursors` and ordered `document_links`; never edit the accepted Phase 3 migration.
3. Write failing normalization tests for issues, pull requests, issue comments, review comments, reviews, linked `#123` references, revert language, and curated `Gatekeeper-Relation` markers.
4. Normalize bounded remote text into existing Project Memory documents with GitHub `remoteUrl`, source status/time, content hashes, and explicit links.
5. Advance a cursor only after a complete batch; retain it after partial failure so malformed records are retried.
6. Rank exact source IDs and ordered linked neighbors ahead of FTS results, preserving repository isolation and excerpt bounds.
7. Run focused migration, hostile-content, incremental, collision, and ranking tests plus the root quality gate.
8. Commit and push.

## Task 4: Add deterministic pull-request review and CLI sync/review commands

**Files:**

- Modify: `packages/review-engine/src/review-worktree.ts`
- Modify: `packages/review-engine/src/review-worktree.test.ts`
- Modify: `packages/review-engine/src/review-completion.ts`
- Modify: matching index exports
- Create or modify: `apps/cli/src/github.ts`
- Modify: `apps/cli/src/project-memory.ts`
- Modify: `apps/cli/src/project-memory.test.ts`
- Modify: `apps/cli/src/index.ts`
- Modify: CLI/package dependencies and reference documentation

1. Write failing engine tests proving the same deterministic policy table evaluates worktree and pull-request change sets without adapter logic.
2. Add the minimum generic change-set reviewer while retaining `reviewWorktree` as a stable wrapper.
3. Detect prompt-injection patterns in the bounded pull-request description as a deterministic content-security escalation with a clickable evidence pointer; never follow the text.
4. Write failing CLI tests for `sync github [path]` and `review pr <number> [path]`, strict positive PR numbers, stable JSON, missing auth exit 3 with repair, sync failure exit 4, and no implicit remote write.
5. Compose repository identity, read-only provider, Project Memory sync, policy evaluation, persistence, and previous-review linkage.
6. Run focused tests and the root quality gate; record evidence.
7. Commit and push.

## Task 5: Expose fixed-repository GitHub sync and PR review through Fastify

**Files:**

- Modify: `apps/server/src/service.ts`
- Modify: `apps/server/src/server.ts`
- Modify: `apps/server/src/server.test.ts`
- Modify: `apps/cli/src/start.ts`
- Modify: shared API documentation

1. Write failing authenticated API tests for `POST /v1/repositories/:repositoryId/sync/github` and `POST /v1/reviews/pull-request`.
2. Reject arbitrary repository/path/remote selectors; accept only the fixed service repository and a strict positive pull-request number.
3. Map missing `gh`/auth to bounded `ENVIRONMENT_ERROR` responses with repair, and partial sync to a successful typed result.
4. Compose the same provider, memory, review engine, and persistence functions used by CLI.
5. Prove remote bodies/diffs/tokens never enter logs or error envelopes.
6. Run focused API/integration/restart tests and the root quality gate.
7. Commit and push.

## Task 6: Add the seventh MCP tool and update the Gatekeeper skill

**Files:**

- Modify: `apps/mcp-server/src/client.ts`
- Modify: `apps/mcp-server/src/client.test.ts`
- Modify: `apps/mcp-server/src/server.ts`
- Modify: `apps/mcp-server/src/server.test.ts`
- Modify: `apps/mcp-server/src/repository-surface.test.ts`
- Modify: `.agents/skills/gatekeeper/SKILL.md`
- Modify: `.agents/skills/gatekeeper/references/workflow.md`
- Modify: `.agents/skills/gatekeeper/references/evidence-and-verdicts.md`
- Modify: MCP/Codex documentation

1. Write failing official-client tests for exactly seven tools and strict positive PR input.
2. Add `gatekeeper_review_pull_request` only after the real API exists; preserve all six Phase 4 schemas and behavior.
3. Return a ReviewDraft from the real read-only PR path so Codex receives deterministic findings and ranked evidence candidates.
4. Update the skill to request sync consent, treat GitHub content as untrusted, present the exact evidence chain, complete locally, and never publish.
5. Validate skill structure and prove no write tool exists.
6. Run focused MCP process/in-memory tests, `codex mcp list`, and the root quality gate.
7. Commit and push.

## Task 7: Add the focused dashboard PR surface and clickable evidence

**Files:**

- Modify: `apps/dashboard/src/api/review-client.ts`
- Modify: `apps/dashboard/src/api/review-client.test.ts`
- Create: `apps/dashboard/src/routes/pull-request-review-route.tsx`
- Create: `apps/dashboard/src/routes/pull-request-review-route.test.tsx`
- Modify: `apps/dashboard/src/routes/review-route.tsx`
- Modify: `apps/dashboard/src/routes/review-detail-route.tsx`
- Modify: `apps/dashboard/src/app/dashboard-app.tsx`
- Modify: `apps/dashboard/src/app/dashboard-app.test.tsx`
- Modify: `apps/dashboard/src/components/app-shell.tsx`
- Modify: `apps/dashboard/src/styles/dashboard.module.css`

1. Write failing client/route tests for positive-number validation, pending/error/partial states, PR target display, and safe external evidence links.
2. Add one focused PR review route using the existing Review Inspector language and tokens; do not redesign the dashboard or start Phase 6 comparison/progress work.
3. Render bounded evidence as plain text and only create external anchors for validated `https://github.com/...` URLs, with safe `rel` attributes.
4. Preserve keyboard focus, visible labels, narrow layouts, and reduced motion.
5. Run dashboard tests, typecheck, build, and a focused interface/accessibility audit.
6. Commit and push.

## Task 8: Add the reproducible Ghost Change fixture and isolated dry-run seeder

**Files:**

- Create: `demo/scenarios.json`
- Create: `demo/fixtures/github/ghost-change.json`
- Create: `demo/scripts/seed-github.ts`
- Create: `demo/scripts/seed-github.test.ts`
- Modify: `demo/tsconfig.json`
- Modify: root scripts and demo documentation

1. Write failing fixture parity tests proving exported records normalize identically to provider output.
2. Encode the Redis proposal, implementation, regression, revert, active ADR, revived PR, passing-test metadata, and hostile PR-body instruction with stable IDs and markers.
3. Prove retrieval orders the proposal/incident, revert, and ADR chain ahead of coincidental Redis lexical matches.
4. Write failing seeder tests proving dry-run default, exact target validation, stable markers, idempotent discovery, no unrelated deletion, and refusal to write without `--apply`.
5. Implement a separate seeder plan and explicit apply executor; do not call apply during Phase 5 acceptance without target-specific approval.
6. Run the offline Ghost Change from provider parsing through completion and persisted review; assert `ESCALATE`, never `BLOCK`.
7. Run focused tests and the root quality gate.
8. Commit and push.

## Task 9: Break the integrated Phase 5 workflow and close the gate

**Files:**

- Modify: `docs/development/phase-5-execution-log.md`
- Modify: `docs/progress.md`
- Modify: GitHub, security, CLI, API, MCP, Project Memory, demo, and testing documentation whose verified behavior changed

1. Attack missing executable/auth, hostile remotes, shell metacharacters, invalid JSON, oversized output, traversal-like paths, 500+ files, duplicate IDs, stale/replayed batches, cursor races, partial malformed records, forged cross-repository links, hostile Markdown/HTML, prompt injection, and inference attempting `BLOCK`.
2. Exercise the complete exported fixture through CLI/application services, Fastify, MCP, SQLite restart, memory retrieval, review completion, and dashboard persisted-review rendering.
3. Confirm Phase 0-4 CLI, API, dashboard, persistence, indexing, MCP, and completion behavior remains green.
4. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, formatting, audit, fixture smoke, `codex mcp list`, and live read-only commands only if `gh`, authentication, and an existing approved demo target are available.
5. Use the Gatekeeper skill to review the Phase 5 worktree and complete the local review; never publish it.
6. Run Ponytail on the whole Phase 5 diff and remove unused abstractions, dependencies, retries, or future-phase UI.
7. Record all expected RED states, unexpected failures, corrections, commands, security conclusions, live-environment limits, and the exact Phase 6 entry condition.
8. Commit and push closeout, verify local `master`, `origin/master`, and remote `master` agree, then stop before Phase 6.
