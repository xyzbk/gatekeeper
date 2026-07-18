# Phase 2 deterministic worktree review implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `executing-plans` task by task. The canonical hackathon plan forbids delegation unless the user explicitly requests it, so this plan executes inline. Every behavior step uses test-driven development.

**Goal:** Deliver one complete, bounded, deterministic worktree-review path through shared contracts, local Git, policy evaluation, CLI, authenticated HTTP, and the dashboard.

**Architecture:** `packages/git-adapter` produces a bounded `ChangeSet` without exposing raw diffs to presentation adapters. The new `packages/review-engine` is the only owner of metrics, policy findings, and verdict assembly. CLI, Fastify, and React consume the same strict `ReviewRun` contract and never reimplement review rules.

**Tech Stack:** Node.js 24, strict TypeScript ESM, pnpm workspaces, Zod 4, YAML, execa argument arrays, `ignore`, Fastify 5, Commander, React 19, TanStack Query 5, React Router 8, CSS Modules, Vitest, and Testing Library.

## Global constraints

- Execute Phase 2 only; stop before SQLite, historical retrieval, MCP, model reasoning, and GitHub PR review.
- Repository and diff content is untrusted data and never instruction.
- Only a hard `DETERMINISTIC` finding may produce `BLOCK`.
- Default tests require no network, GitHub authentication, or OpenAI key.
- Every subprocess uses an executable plus an argument array with no shell.
- Paths are repository-relative POSIX paths after canonicalization; traversal and out-of-repository symlinks fail closed.
- Diff output is bounded to 2 MiB, one file is bounded to 1 MiB for added-line inspection, a review contains at most 500 changed paths, and stored added lines are capped at 500 per file.
- Review output contains path/status/count summaries, never raw source or the raw diff.
- Existing localhost bearer authentication, Host/Origin validation, CSP, and log-redaction behavior remain intact.
- Use the existing dark graphite dashboard system; add no component, charting, state, animation, or styling dependency.
- Each completed green task is committed intentionally and pushed to `origin/master`; no red state is pushed.

## File map

- `packages/contracts/src/change.ts`: serialized bounded change-set shapes.
- `packages/contracts/src/review.ts`: review-run schema extended with bounded change summaries and path groups.
- `packages/git-adapter/src/worktree-diff.ts`: safe Git extraction, ignore handling, path validation, and diff parsing.
- `packages/review-engine/src/review-worktree.ts`: metrics, five policies, deterministic findings, summary, and verdict.
- `apps/cli/src/worktree-review.ts`: thin composition of config, Git adapter, and review engine.
- `apps/cli/src/index.ts`: Commander presentation for `policy validate` and `review worktree`.
- `apps/server/src/server.ts`: authenticated `POST /v1/reviews/worktree` adapter.
- `apps/dashboard/src/api/review-client.ts`: bootstrap-authenticated review request and contract parsing.
- `apps/dashboard/src/routes/review-route.tsx`: request, pending, error, and completed Review Inspector states.
- `demo/prepare-fixtures.ts`: idempotent disposable Git repositories for acceptance.
- `docs/development/phase-2-execution-log.md`: durable red/green, failure, correction, and decision record.

---

### Task 1: Phase contract and safe worktree extraction

**Files:**

- Create: `packages/contracts/src/change.ts`
- Create: `packages/contracts/src/change.test.ts`
- Create: `packages/contracts/scripts/generate-verdict-schema.ts`
- Create: `packages/domain/src/change.ts`
- Create: `packages/git-adapter/src/worktree-diff.ts`
- Create: `packages/git-adapter/src/worktree-diff.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/review.ts`
- Modify: `packages/contracts/src/review.test.ts`
- Modify: `packages/git-adapter/src/git-provider.ts`
- Modify: `packages/git-adapter/src/index.ts`
- Modify: `packages/git-adapter/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

```ts
type ChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';

interface ChangedFile {
  path: string;
  previousPath?: string;
  status: ChangeStatus;
  additions: number;
  deletions: number;
  binary: boolean;
  contentTruncated: boolean;
  addedLines: string[];
}

interface ChangeSet {
  schemaVersion: 1;
  target: { kind: 'worktree'; display: 'Current worktree' };
  files: ChangedFile[];
}

interface WorktreeDiffOptions {
  ignorePatterns?: readonly string[];
}
```

- [x] Write strict Zod contract tests that reject unknown fields, traversal paths, more than 500 files, more than 500 added lines, and lines over 2,000 characters.
- [x] Run `pnpm test packages/contracts/src/change.test.ts`; verify RED because the contract does not exist.
- [x] Implement the minimum strict change contract and export it.
- [x] Run the focused contract tests; verify GREEN.
- [x] Write real temporary-repository tests for combined staged/unstaged/untracked extraction, `.gitignore`, `.gatekeeperignore`, policy ignores, rename/binary metrics, 2 MiB output rejection, malformed stat rejection, traversal rejection, and out-of-root symlink rejection.
- [x] Run `pnpm test packages/git-adapter/src/worktree-diff.test.ts`; verify RED because `getWorktreeDiff` does not exist.
- [x] Implement `getWorktreeDiff` with `git diff HEAD --numstat -z --find-renames`, `git diff HEAD --name-status -z --find-renames`, `git diff HEAD --unified=0 --no-ext-diff --find-renames`, and `git ls-files --others --exclude-standard -z`; use `ignore` for Gatekeeper/policy patterns and execa limits/timeouts.
- [x] Run the focused adapter and contract tests; verify GREEN.
- [x] Extend `ReviewMetrics` with `pathGroups: { name: string; count: number }[]` and `ReviewRun` with `changes: ChangedFileSummary[]`, regenerate `schemas/verdict.schema.json`, and keep its drift test green.
- [x] Run root lint, typecheck, test, build, format check, and audit; record outcomes in the execution log.
- [ ] Commit and push `feat(git): extract bounded worktree changes`.

### Task 2: Deterministic review engine

**Files:**

- Create: `packages/review-engine/package.json`
- Create: `packages/review-engine/tsconfig.json`
- Create: `packages/review-engine/src/index.ts`
- Create: `packages/review-engine/src/review-worktree.ts`
- Create: `packages/review-engine/src/review-worktree.test.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `tsconfig.base.json`
- Modify: `tsconfig.eslint.json`
- Modify: `vitest.workspace.ts`

**Interface:**

```ts
interface ReviewWorktreeInput {
  changeSet: ChangeSet;
  createdAt: string;
  policy: GatekeeperPolicy;
  repositoryId: RepositoryId;
  reviewId: ReviewId;
}

function reviewWorktree(input: ReviewWorktreeInput): ReviewRun;
function createLocalRepositoryId(canonicalRoot: string): RepositoryId;
```

- [x] Write one RED test each for clean-with-test `FAST_PATH`, source-without-test `REQUIRE_CHANGES`, critical auth `ESCALATE`, protected path `BLOCK`, changed-file/line limits, import-boundary violation from added relative imports, metrics/path groups, policy-ignored files, and inference unable to produce `BLOCK`.
- [x] Run `pnpm test packages/review-engine/src/review-worktree.test.ts`; verify failures are missing behavior, not setup errors.
- [x] Implement pure helpers for classification, glob matching through `ignore`, import-specifier resolution, finding construction, deterministic summary, and `assembleVerdict` delegation.
- [x] Keep documentation/generated-file policy evaluation deferred because the canonical hackathon Phase 2 lists exactly five policies.
- [x] Run focused tests; verify GREEN, then run the full repository gates and audit.
- [x] Record RED/GREEN evidence and any correction in the execution log.
- [ ] Commit and push `feat(review): evaluate deterministic worktree policy`.

### Task 3: Policy loader, CLI, and disposable acceptance fixtures

**Files:**

- Create: `packages/config/src/repository-policy.ts`
- Create: `packages/config/src/repository-policy.test.ts`
- Create: `apps/cli/src/worktree-review.ts`
- Create: `apps/cli/src/worktree-review.test.ts`
- Create: `demo/prepare-fixtures.ts`
- Create: `demo/tsconfig.json`
- Modify: `packages/config/src/index.ts`
- Modify: `apps/cli/src/index.ts`
- Modify: `apps/cli/package.json`
- Modify: `apps/cli/tsconfig.json`
- Modify: `package.json`
- Modify: `.gitignore`

**CLI contract:**

```text
gatekeeper policy validate [path]
gatekeeper review worktree [path] --format human|json
```

- [x] Write RED tests for `.gatekeeper/policies.yaml` discovery, missing-policy safe defaults for review, invalid-policy paths, JSON output validating through `reviewRunSchema`, human verdict/finding/remediation output, and safe exit-code mapping.
- [x] Implement `loadRepositoryPolicy` with canonical root validation and a strict `version: 1` empty policy only when review has no file; `policy validate` must report a missing file as configuration error.
- [x] Implement one `runWorktreeReview` composition used by every adapter: inspect repository, load policy, extract changes with policy ignores, then call the pure engine with injected clock/ID factories in tests.
- [x] Implement Commander groups without moving domain behavior into the CLI.
- [x] Implement `pnpm fixtures:prepare` using `node:child_process` executable-plus-array calls. It recreates only `demo/fixtures/{clean,missing-test,protected-path}`, initializes Git, commits a baseline policy/source/test state, then applies the scenario worktree changes.
- [x] Run `pnpm fixtures:prepare` and the three source CLI acceptance commands; verify `FAST_PATH`, `REQUIRE_CHANGES`, and `BLOCK`.
- [x] Run full gates and audit; record evidence.
- [ ] Commit and push `feat(cli): review deterministic worktrees`.

### Task 4: Authenticated local review API

**Files:**

- Modify: `packages/contracts/src/review.ts`
- Modify: `apps/server/src/server.ts`
- Modify: `apps/server/src/server.test.ts`
- Modify: `apps/server/src/service.ts`
- Modify: `apps/server/package.json`
- Modify: `apps/server/tsconfig.json`
- Modify: `apps/cli/src/start.ts`
- Modify: `apps/cli/src/start.test.ts`

**Endpoint:**

```text
POST /v1/reviews/worktree
Authorization: Bearer <ephemeral token>
Body: {}
Response: ReviewRun v1
```

- [x] Write RED API tests for bearer authentication, strict empty body, no path/query selector, shared draft-7 response schema generated from Zod, exact injected ReviewRun response, and safe internal failure without diff/source logging.
- [x] Add `reviewWorktree: () => Promise<ReviewRunContract>` to service composition and register the endpoint without importing Git/config behavior into Fastify.
- [x] Wire `gatekeeper start` to the same CLI composition used by direct review.
- [x] Run focused server/start tests and full gates; record evidence.
- [x] Commit and push `feat(server): expose local worktree reviews`.

### Task 5: Accessible Review Inspector

**Files:**

- Create: `apps/dashboard/src/api/review-client.ts`
- Create: `apps/dashboard/src/api/review-client.test.ts`
- Create: `apps/dashboard/src/routes/review-route.tsx`
- Modify: `apps/dashboard/src/app/dashboard-app.tsx`
- Modify: `apps/dashboard/src/app/dashboard-app.test.tsx`
- Modify: `apps/dashboard/src/components/app-shell.tsx`
- Modify: `apps/dashboard/src/main.tsx`
- Modify: `apps/dashboard/src/styles/dashboard.module.css`

- [x] Write RED client tests proving the token appears only in the Authorization header and malformed/failing responses do not echo content.
- [x] Write RED component tests for ready-to-run, pending, retryable error, and completed states; every verdict and authority must have readable text, not color-only meaning.
- [x] Implement one mutation-backed review request and a single route at `/reviews/worktree` with verdict header, deterministic findings, metrics, affected paths, remediation, and bounded diff summary.
- [x] Change the skip link target to generic main content and make Reviews a real navigation link; keep Memory unavailable.
- [x] Reuse existing panels, tokens, type, focus, and reduced-motion rules; add no dependency.
- [x] Run dashboard tests, full gates, Impeccable detector, desktop browser review, 375-pixel browser review, and console audit.
- [x] Record evidence, then commit and push `feat(dashboard): inspect worktree reviews`.

### Task 6: Phase acceptance, public documentation, and stop gate

**Files:**

- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/reference/policy.md`
- Modify: `docs/reference/verdicts.md`
- Modify: `docs/reference/local-api.md`
- Create: `docs/reference/cli.md`
- Create: `docs/architecture/review-pipeline.md`
- Modify: `docs/development/phase-2-execution-log.md`
- Modify: `docs/progress.md`

- [x] Review every canonical Phase 2 deliverable and test against its implementation; record any deliberate limitation.
- [x] Document policy semantics, change bounds, CLI/API contracts, review pipeline, privacy behavior, errors/failures, and exact stop gate.
- [x] Run `pnpm install --frozen-lockfile`, lint, typecheck, test, build, format check, audit, and `pnpm fixtures:prepare`.
- [x] Run the exact three fixture reviews plus policy validation and confirm expected verdicts.
- [x] Run a final whole-diff code/security/Ponytail review and resolve every important finding.
- [x] Update `docs/progress.md` with the complete report and exact Phase 3 entry condition.
- [x] Commit and push `docs(phase-2): record verified completion`.
- [x] Verify a clean worktree and `HEAD === origin/master`, then mark the goal complete.

## Stop gate

Phase 2 ends when the deterministic fixture verdicts, CLI JSON, API response, and dashboard all agree on the same strict ReviewRun v1 contract. Do not create SQLite, Project Memory, FTS5, MCP, Codex-skill, model-reasoning, GitHub-sync, or pull-request-review code.
