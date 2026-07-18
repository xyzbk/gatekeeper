# Phase 6: Dashboard Hero Experience and Remediation Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use Executing Plans to implement this plan task-by-task inline. The user authorized direct work on `master`; each passing task is committed intentionally and pushed to `origin/master` before the next task begins. RED states are observed locally and never committed or pushed.

**Goal:** Turn Gatekeeper's persisted review intelligence into a judge-ready local product experience with real progress, an ordered evidence chain, actionable remediation, and an honest before/after re-review comparison.

**Architecture:** Keep the existing synchronous CLI/MCP review endpoints stable. Add a tiny persisted review-operation record and dashboard-only start endpoints that run the same review services in the foreground process, while `GET /v1/reviews/:reviewId` becomes the single polling/deep-link response. Project Memory supplies relationship-aware evidence; the completed response joins the current review, its previous review, and bounded timeline items. React renders that shared contract through TanStack Query polling and native browser interactions.

**Tech Stack:** Node.js 24, strict TypeScript ESM, Zod 4, SQLite/Drizzle, Fastify 5, React 19, React Router, TanStack Query v5, CSS Modules, Vitest, Testing Library, and Playwright Chromium.

## Global Constraints

- Execute Phase 6 only and stop at its gate.
- Preserve the existing OpenAI/Codex-inspired dark graphite system, IBM Plex Sans, CSS Modules, radius tokens, and restrained semantic color.
- Preserve synchronous worktree and pull-request review behavior for CLI and MCP consumers.
- The dashboard start path uses an in-process promise only; no daemon, queue, worker, scheduler, SSE, or crash-resume system is added.
- Repository and GitHub content remains untrusted plain text. No raw HTML, source, raw diff, token, or private error detail is rendered or logged.
- Model inference cannot produce `BLOCK`; the dashboard never owns verdict assembly.
- Prompt copying is a local clipboard action. The dashboard does not embed, call, or impersonate Codex.
- Default Vitest remains network-, GitHub-auth-, browser-, and OpenAI-key-free.
- Do not add settings, policy editing, collaboration, analytics, accounts, hosting, charts, or future packages.
- Use Ponytail at full intensity, test-first development, and fresh verification before every commit.

---

## Task 1: Freeze the Phase 6 execution and product contract

**Files:**

- Create: `PRODUCT.md`
- Create: `docs/superpowers/plans/2026-07-19-phase-6-dashboard-hero.md`
- Create: `docs/development/phase-6-execution-log.md`

**Interfaces:**

- Consumes: canonical Phase 6 build, tests, acceptance, and stop gate.
- Produces: the fixed product register, scope decisions, task boundaries, and evidence log used by every later task.

1. Record the product users, positioning, anti-references, accessibility target, and five strategic design principles.
2. Record the compatibility decision: synchronous review remains; dashboard progress uses explicit start endpoints plus the existing review deep link.
3. Record the no-worker ceiling and the restart behavior: interrupted queued/running operations become a bounded failed state.
4. Run `pnpm exec prettier --check PRODUCT.md docs/superpowers/plans/2026-07-19-phase-6-dashboard-hero.md docs/development/phase-6-execution-log.md` and `git diff --check`.
5. Commit as `docs: define phase 6 dashboard execution` and push `master`.

## Task 2: Persist strict review-operation state

**Files:**

- Modify: `packages/contracts/src/review.ts`
- Modify: `packages/contracts/src/review.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/store-sqlite/drizzle/0002_review_operations.sql`
- Modify: `packages/store-sqlite/drizzle/meta/_journal.json`
- Modify: `packages/store-sqlite/src/schema.ts`
- Modify: `packages/store-sqlite/src/sqlite-project-store.ts`
- Modify: `packages/store-sqlite/src/sqlite-project-store.test.ts`
- Modify: `packages/project-memory/src/project-memory.ts`
- Modify: `packages/project-memory/src/project-memory.test.ts`

**Interfaces:**

- Produces: `ReviewOperationContract`, strict queued/running/failed/completed branches, `saveReviewOperation`, `getReviewOperation`, and `failInterruptedReviewOperations`.
- Completed operations carry the persisted `ReviewRun`; in-progress rows carry only bounded stage metadata.

1. Write one failing contract test for strict discriminated states, stage values, completed review validation, bounded failure copy, and unknown-field rejection. Run the focused test and confirm the expected RED schema/import failure.
2. Implement the minimum Zod schemas and exports. Run the focused contract test GREEN.
3. Write failing migration/store tests for queued to running, failure persistence, cross-repository ID collision, review completion, corrupt JSON, and restart interruption.
4. Add one append-only migration and one `review_operations` table. Never edit accepted migrations.
5. Implement direct parameterized reads/writes in the existing SQLite adapter. When `saveReview` sees a matching operation, persist the completed operation in the same transaction.
6. Expose the three methods through the existing Project Memory interface without a new repository abstraction.
7. Run focused contract/store/memory tests, then root lint, typecheck, test, and build.
8. Record RED/GREEN evidence, commit as `feat: persist review operation progress`, and push.

## Task 3: Run and poll real dashboard review operations

**Files:**

- Modify: `apps/cli/src/worktree-review.ts`
- Modify: `apps/cli/src/pull-request-review.ts`
- Modify: `apps/cli/src/start.ts`
- Modify: matching CLI tests
- Modify: `apps/server/src/service.ts`
- Modify: `apps/server/src/server.ts`
- Modify: `apps/server/src/server.test.ts`
- Modify: `apps/server/src/ghost-change.integration.test.ts`
- Modify: API documentation

**Interfaces:**

- Produces: `POST /v1/reviews/worktree/start`, `POST /v1/reviews/pull-request/start`, and operation responses from `GET /v1/reviews/:reviewId`.
- The service preallocates the final review ID and passes it through `PersistentReviewContext.reviewId` so polling and the durable review share one identity.

1. Write failing server tests that hold injected review promises and prove `queued -> evaluating_change -> completed`, `syncing_history` for pull requests, bounded failure, authentication, strict inputs, and restart interruption.
2. Confirm RED against missing start routes and operation response schema.
3. Let CLI review contexts accept an optional preallocated review ID; preserve direct CLI ID generation when absent.
4. Add one service-local `startReviewOperation` helper. It schedules one caught promise, updates real stages around existing actions, and saves the existing ReviewRun. No retries or queue.
5. Keep existing synchronous POST routes unchanged. Add the two strict 202 start routes and make GET return a typed operation, synthesizing completed state for older reviews.
6. Prove an operation cannot return a review with a mismatched ID/repository/target and cannot leak the thrown error.
7. Run focused CLI/server/restart/Ghost tests, then the root quality gate.
8. Record findings, commit as `feat: expose pollable review progress`, and push.

## Task 4: Build relationship-aware inspector data

**Files:**

- Modify: `packages/contracts/src/memory.ts`
- Modify: `packages/contracts/src/review.ts`
- Modify: matching contract tests
- Modify: `packages/store-sqlite/src/sqlite-project-store.ts`
- Modify: `packages/store-sqlite/src/sqlite-project-store.test.ts`
- Modify: `packages/project-memory/src/project-memory.ts`
- Modify: `packages/project-memory/src/project-memory.test.ts`
- Modify: `apps/server/src/service.ts`
- Modify: `apps/server/src/ghost-change.integration.test.ts`

**Interfaces:**

- Produces: `EvidenceTimelineItem` with `role`, `relationship`, `sourceAuthority`, `status`, bounded pointer, and safe link; completed operations also return `previousReview`.
- Role order is `proposal`, `implementation`, `incident`, `revert`, `decision`, `revived_change`, then `context`.

1. Write failing search tests proving a linked result retains its explicit relationship type and position.
2. Write failing timeline tests for the six-node Ghost Change order, active/superseded indicators, repository/GitHub authority, safe GitHub/file URLs, deduplication, and a bounded generic fallback.
3. Select the link type in the existing linked SQL query and extend the strict memory result contract only with optional `relationship`.
4. Implement one pure `buildEvidenceTimeline` function in Project Memory. Use explicit relationship plus source type/title; do not hardcode fixture IDs.
5. Compose completed operations with previous review and timeline in the service. Missing historical context returns an empty timeline, not a synthetic claim.
6. Add comparison-contract tests for resolved, remaining, and unchanged/superseded evidence inputs; keep verdict ownership in the review engine and comparison derivation in the client.
7. Run focused tests and the root quality gate.
8. Record evidence, commit as `feat: expose review evidence timeline`, and push.

## Task 5: Finish the Review Inspector and remediation loop

**Files:**

- Modify: `apps/dashboard/src/api/review-client.ts`
- Modify: `apps/dashboard/src/api/review-client.test.ts`
- Modify: `apps/dashboard/src/routes/review-route.tsx`
- Modify: `apps/dashboard/src/routes/review-detail-route.tsx`
- Modify: `apps/dashboard/src/routes/pull-request-review-route.tsx`
- Modify: matching route/app tests
- Create: focused local components only when the existing route becomes unreadable
- Modify: `apps/dashboard/src/routes/memory-route.tsx`
- Modify: `apps/dashboard/src/styles/dashboard.module.css`

**Interfaces:**

- Consumes: `ReviewOperationContract` from the shared client.
- Produces: stage polling, ordered `EvidenceTimeline`, grouped remediation, copyable Codex prompts, and `ReviewComparison` derived from current/previous immutable reviews.

1. Write failing client tests for start, bounded polling, abort, completed unwrap, failed/offline state, and no duplicate GitHub sync call.
2. Write failing component tests for every verdict/authority, semantic timeline order, safe links, native `<details>` excerpts, current status, loading/partial/offline/error, clipboard success/failure, keyboard reachability, and no raw HTML.
3. Implement polling with TanStack Query's `refetchInterval` on running states. Do not add an effect, global state, timer hook, or state library.
4. Recompose the inspector as a verdict header, compact metrics/path summary, findings, ordered evidence timeline, remediation/actions, comparison, and bounded changes. Avoid nested cards and decorative metrics.
5. Derive comparison by stable finding IDs and evidence pointer keys: verdict transition, resolved IDs, remaining IDs, unchanged evidence, and superseded evidence.
6. Generate prompts from the review ID and target only. Use `navigator.clipboard.writeText`; announce success/failure through an accessible live region.
7. Add internal Project Memory deep links for local paths and validated `https://github.com` anchors for remote evidence. Auto-run only an explicit memory query from the URL.
8. Preserve 1440x900, 1280x720, and 1024x768 composition, 44px narrow touch targets, visible focus, plain-text excerpts, and reduced motion.
9. Run dashboard tests, typecheck, build, the fresh Web Interface Guidelines audit, and the Impeccable detector.
10. Record results, commit as `feat: complete dashboard remediation loop`, and push.

## Task 6: Prove the Ghost Change in a real browser and close Phase 6

**Files:**

- Modify: root `package.json` and `pnpm-lock.yaml`
- Create: `playwright.config.ts`
- Create: `tests/e2e/ghost-change.spec.ts`
- Modify: `docs/development/phase-6-execution-log.md`
- Modify: `docs/progress.md`
- Modify: dashboard/API/testing documentation whose verified behavior changed

**Interfaces:**

- Produces: exact `pnpm playwright test` acceptance and the Phase 6 completion report.

1. Add only `@playwright/test` as the required browser-test dependency; use Chromium and the already built dashboard.
2. Build a network-free Playwright fixture by starting the real service with the exported Ghost provider and a temporary Git repository. Do not add a production demo server before Phase 7.
3. Exercise PR #12 through start, real progress, ESCALATE, six-node evidence timeline, prompt copy, remediation, re-review, FAST_PATH, before/after comparison, and a service restart deep link.
4. Run the route at 1440x900, 1280x720, and 1024x768; assert no document overflow, keyboard access, visible focus, and reduced-motion behavior. Read every captured PNG before accepting it.
5. Attack invalid PR numbers, operation ID collision, failing callbacks, malformed operation JSON, unsafe URLs, HTML/script excerpts, long excerpts/paths, offline polling, and interrupted restart state.
6. Fetch the latest Web Interface Guidelines, audit all changed dashboard files, and repair every applicable finding.
7. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm playwright test`, `pnpm format:check`, `pnpm audit --audit-level high`, and `git diff --check` with fresh output.
8. Run Ponytail over the Phase 6 diff and remove any redundant component, dependency, polling abstraction, animation, or future-phase surface.
9. Update the execution log and `docs/progress.md` with exact tests, failures, corrections, limitations, security conclusions, traceability, and the Phase 7 entry condition.
10. Commit as `docs: complete phase 6 dashboard experience`, push, confirm local and remote `master` agree, and stop at the Phase 6 gate.

## Self-Review

- Spec coverage: every Phase 6 build/test/acceptance item maps to Tasks 2-6; stop-gate items are explicitly excluded.
- Placeholder scan: no task contains TBD, future scaffolding, or an unspecified error-handling step.
- Type consistency: `ReviewOperationContract` is the single serialized polling boundary; completed operations own `review`, `previousReview`, and `evidenceTimeline`; dashboard comparison is derived and never persisted.
- Ponytail audit: one operation table, two start routes, one existing GET route, one polling query, no new application layer, worker, transport, state library, component library, or chart library.
