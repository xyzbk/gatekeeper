# Foundation Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Gatekeeper fail safely and remain under the local user's control when service instances collide, repositories drift, operations are interrupted, stored state is corrupt, or history is unusual.

**Architecture:** Keep Gatekeeper one foreground service for one fixed repository. Add a tiny machine-local owner lock, validate the repository's immutable remote identity at every sensitive boundary, and make review-operation state terminal even when persistence fails. Persisted JSON remains fail-closed; an explicitly requested local repair quarantines only invalid operation records after creating a consistent backup. No hosted service, worker, queue, dependency, GitHub write, or target-repository mutation is added.

**Tech Stack:** Existing Node.js 24, TypeScript strict ESM, native `fs`/`process`, Fastify, SQLite/better-sqlite3/Drizzle, Zod, execa argument arrays, Vitest, Playwright, pnpm.

## Global Constraints

- Work directly on user-authorized `master`; commit and push each green task to `origin/master`.
- Use test-first development and Ponytail at full intensity; do not use brainstorming or add a dependency.
- The domain stays independent of service, storage, CLI, MCP, and dashboard adapters.
- Default tests remain offline and never require `gh`, GitHub authentication, or an OpenAI key.
- No Git command may check out, reset, modify refs, or modify the target repository.
- Repository/GitHub content is untrusted data; deterministic hard policy remains the only `BLOCK` authority.
- Every persisted-state repair is local-only, explicit, backed up first, and reports no source/diff/token content.

---

## Audit evidence and acceptance map

| Audit evidence                                                                                                                                  | Failure mode                                                                          | Task that closes it |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------- |
| `apps/server/src/service.ts` wrote/removes one shared `service.json` without ownership and calls interrupted-operation cleanup on every startup | A second service overwrites MCP metadata and can fail the first service's live review | 1                   |
| `ProjectMemory.registerRepository` selected an existing record by root **or** remote; local indexing compared only the root                     | Changing `origin` or replacing a checkout at the same path can mix evidence           | 2                   |
| MCP compared `indexState.head` with the start-time snapshot                                                                                     | Codex can call stale memory current after a new commit                                | 2                   |
| Detached review task swallowed a second persistence failure                                                                                     | User can poll queued/running forever after a local persistence/shutdown failure       | 3                   |
| Corrupt queued/running operation JSON aborts startup and has no recovery command                                                                | User loses access to the whole local service                                          | 4                   |
| Previous-review lookup used `Commit <first 12 SHA>` display text                                                                                | A prefix collision can join different historical commits                              | 5                   |

### Task 1: Enforce one local service owner

**Files:**

- Modify: `apps/server/src/service.ts`
- Modify: `apps/server/src/service.test.ts`
- Modify: `docs/reference/local-api.md`

**Interfaces:**

- Produces private `acquireServiceOwnership(paths): Promise<() => Promise<void>>`.
- The releaser owns only its lock; no instance may delete another service's metadata.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
it('rejects a second foreground service without changing the first metadata', async () => {
  const first = await startGatekeeperService(options);
  await expect(startGatekeeperService(options)).rejects.toThrow('already running');
  expect(JSON.parse(await readFile(paths.serviceMetadata, 'utf8'))).toMatchObject({
    port: new URL(first.baseUrl).port,
  });
  await first.close();
});

it('reclaims a lock only when its recorded process no longer exists', async () => {
  await writeFile(lockPath, JSON.stringify({ pid: 999_999_999 }));
  const service = await startGatekeeperService(options);
  await service.close();
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run apps/server/src/server.test.ts`

Expected: the second service starts today and the stale lock helper does not exist.

- [ ] **Step 3: Add the smallest owner lock**

```ts
const lockPath = `${paths.serviceMetadata}.lock`;
const handle = await open(lockPath, 'wx', 0o600);
await handle.writeFile(JSON.stringify({ pid: process.pid }));

return async () => {
  await rm(lockPath, { force: true });
};
```

On `EEXIST`, read only a validated PID, test process liveness with `process.kill(pid, 0)`, remove only an absent-process lock once, then retry once. Acquire before opening SQLite; release in all startup/close paths. The lock serializes metadata ownership, so existing metadata removal is safe only while the owner lock is held.

- [ ] **Step 4: Run GREEN and focused static checks**

Run: `pnpm exec vitest run apps/server/src/server.test.ts && pnpm exec tsc -b apps/server/tsconfig.json --pretty false && pnpm lint`

Expected: PASS.

- [ ] **Step 5: Document and commit**

Document the one-foreground-service rule and stale-lock repair message. Commit: `fix: enforce a single gatekeeper service`.

### Task 2: Bind memory and freshness to the live fixed repository

**Files:**

- Modify: `packages/project-memory/src/project-memory.ts`
- Modify: `packages/project-memory/src/project-memory.test.ts`
- Modify: `apps/server/src/service.ts`
- Modify: `apps/server/src/server.test.ts`
- Modify: `apps/mcp-server/src/server.test.ts`
- Modify: `.agents/skills/gatekeeper/references/workflow.md`

**Interfaces:**

- `indexLocalRepository` rejects a changed normalized remote with `REPOSITORY_MISMATCH`.
- `getStatus` reads the current snapshot for the original root and rejects remote/root drift.

- [ ] **Step 1: Write failing identity/freshness tests**

```ts
await expect(memory.indexLocalRepository({ repositoryId })).rejects.toMatchObject({
  code: 'REPOSITORY_MISMATCH',
});

await commitNewHead(repositoryRoot);
expect((await client.status()).memory.indexState?.head).not.toBe(
  (await client.status()).status.repository.head,
);
```

Also prove a changed `origin` at the same root cannot reuse the old record, and that MCP says `stale` until a fresh index completes.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run packages/project-memory/src/project-memory.test.ts apps/server/src/server.test.ts apps/mcp-server/src/server.test.ts`

Expected: root-only validation and start-time status make the tests fail.

- [ ] **Step 3: Implement identity and status checks**

```ts
if (normalizeRemoteIdentity(snapshot.remote) !== normalizeRemoteIdentity(repository.remote)) {
  throw new ProjectMemoryError('REPOSITORY_MISMATCH', 'The registered repository remote changed.');
}
```

For a root that already belongs to another normalized remote, fail with the same bounded mismatch rather than updating its existing record. Build status from a fresh `inspectRepository(options.repository.root)` snapshot and reject changed root/remote before returning it. Preserve detached HEAD and local-only repositories.

- [ ] **Step 4: Run GREEN**

Run: `pnpm exec vitest run packages/project-memory/src/project-memory.test.ts apps/server/src/server.test.ts apps/mcp-server/src/server.test.ts && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Update skill/docs and commit**

State that freshness is live and a remote mismatch requires an explicit restart/repair rather than mixing memories. Commit: `fix: bind memory to the live repository identity`.

### Task 3: Make review operations terminal and bounded

**Files:**

- Modify: `apps/server/src/service.ts`
- Modify: `apps/server/src/server.test.ts`
- Modify: `docs/security/overview.md`

**Interfaces:**

- The service owns a private `Map<ReviewId, ReviewOperationContract>` of active operations.
- A failed persistence transition has an in-memory terminal failure response until shutdown.
- Shutdown stops accepting operations, marks active persisted operations failed when storage is available, and never lets an old task overwrite that terminal result.

- [ ] **Step 1: Write failing operation tests**

```ts
it('returns a terminal failed operation when failure persistence also fails', async () => {
  // review callback rejects; injected saveReviewOperation rejects only for failed state
  await startWorktreeReview();
  await expect.poll(getOperation).toMatchObject({ status: 'failed', stage: 'failed' });
});

it('does not let a review complete after service shutdown marked it interrupted', async () => {
  const started = await startWorktreeReview();
  await service.close();
  releaseReview();
  expect(await reopenedOperation(started.reviewId)).toMatchObject({ status: 'failed' });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run apps/server/src/server.test.ts`

Expected: the detached task swallows the fallback persistence failure or can later overwrite shutdown state.

- [ ] **Step 3: Add the minimal lifecycle controller**

Track one promise per review ID and an `acceptingOperations` boolean. Put `createReviewContext` inside the task's `try`. On every failure construct one bounded `failed` operation, attempt persistence, and retain it in the map if persistence fails. `getComposedReviewOperation` checks this map before SQLite. During close, set `acceptingOperations = false`, persist interruption failures for active IDs, and prevent workers from writing completion after shutdown. Emit only operation ID/category logs; do not add a worker, queue, retry policy, or new transport.

- [ ] **Step 4: Run GREEN**

Run: `pnpm exec vitest run apps/server/src/server.test.ts && pnpm lint && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Document and commit**

Document bounded foreground shutdown behavior and local failure visibility. Commit: `fix: harden review operation lifecycle`.

### Task 4: Diagnose and explicitly repair corrupt local operation state

**Files:**

- Modify: `packages/store-sqlite/src/sqlite-project-store.ts`
- Modify: `packages/store-sqlite/src/sqlite-project-store.test.ts`
- Modify: `packages/project-memory/src/project-memory.ts`
- Modify: `apps/cli/src/doctor.ts`
- Modify: `apps/cli/src/doctor.test.ts`
- Modify: `apps/cli/src/index.ts`
- Modify: `docs/reference/cli.md`
- Modify: `docs/security/overview.md`

**Interfaces:**

- `inspectStoredState(): { integrity: 'ok' | 'corrupt'; corruptReviewOperations: number }` reports no stored content.
- `repairCorruptReviewOperations()` requires an explicit CLI `doctor --repair`, creates a consistent local backup, then removes only unparsable operation rows.

- [ ] **Step 1: Write failing corruption/repair tests**

```ts
expect(store.inspectStoredState()).toEqual({ integrity: 'corrupt', corruptReviewOperations: 1 });
expect(store.repairCorruptReviewOperations()).toMatchObject({
  repaired: 1,
  backupPath: expect.any(String),
});
expect(reopened.getReviewOperation(corruptId)).toBeNull();
```

Also verify regular Doctor reports a bounded repair command, `--repair` never reads/reports source/diff JSON, and valid operations/reviews remain untouched.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run packages/store-sqlite/src/sqlite-project-store.test.ts apps/cli/src/doctor.test.ts`

Expected: inspection/repair methods and `--repair` command are absent.

- [ ] **Step 3: Implement narrow local repair**

Use `PRAGMA quick_check` plus `reviewOperationSchema.safeParse(JSON.parse(...))` to count corrupt rows. Before deletion, create a SQLite-consistent backup using the native driver API into Gatekeeper app data; delete only IDs that fail parse inside one immediate transaction. Do not repair review runs automatically, reset a repository, alter target files, or emit row content. If database integrity itself fails, report a bounded manual-recovery message and leave data untouched.

- [ ] **Step 4: Run GREEN**

Run: `pnpm exec vitest run packages/store-sqlite/src/sqlite-project-store.test.ts apps/cli/src/doctor.test.ts && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Document and commit**

Document backup location, explicit confirmation/repair semantics, and the non-goal of automatically changing repository files. Commit: `fix: add safe local state recovery`.

### Task 5: Use full historical identity and prove weird-history safety

**Files:**

- Modify: `packages/store-sqlite/src/schema.ts`
- Create: `packages/store-sqlite/drizzle/0003_review_target_key.sql`
- Modify: `packages/store-sqlite/src/sqlite-project-store.ts`
- Modify: `packages/store-sqlite/src/sqlite-project-store.test.ts`
- Modify: `packages/git-adapter/src/commit-diff.test.ts`
- Modify: `apps/server/src/server.test.ts`
- Modify: `docs/reference/cli.md`
- Modify: `docs/development/foundation-hardening-execution-log.md`
- Modify: `docs/progress.md`

**Interfaces:**

- Each review run persists a private full `target_key`; commit keys include the complete SHA.
- `latestReviewId` matches `target_key`, never the display label.

- [ ] **Step 1: Write failing full-identity and Git edge tests**

```ts
const first = commitReview('aaaaaaaaaaaa1111...');
const second = commitReview('aaaaaaaaaaaa2222...');
store.saveReview(first);
expect(store.latestReviewId(second.repositoryId, second.target)).toBeNull();
```

Keep real temporary-repository tests for root commits, first-parent merge commits, deleted/renamed/binary changes, SHA option injection, non-commit objects, and unchanged branch/HEAD/index/worktree. Add the full-key collision assertion to server re-review coverage.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run packages/store-sqlite/src/sqlite-project-store.test.ts packages/git-adapter/src/commit-diff.test.ts apps/server/src/server.test.ts`

Expected: prefix-colliding display targets currently link as previous reviews.

- [ ] **Step 3: Implement one migration and key helper**

```ts
function targetKey(target: ReviewRunContract['target']): string {
  return target.kind === 'commit_range'
    ? `commit:${target.head}`
    : `${target.kind}:${target.display}`;
}
```

Add non-null `target_key` to `review_runs`, backfill legacy rows from their validated JSON, index `(repository_id, target_key, created_at)`, and query that key. Do not change public review contracts or the human-friendly display.

- [ ] **Step 4: Run GREEN and full acceptance**

Run:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm playwright test
pnpm demo:smoke
pnpm eval
pnpm model-data:dry-run
pnpm format:check
pnpm audit --audit-level high
git fsck --strict --no-dangling
git diff --check
```

Expected: every command exits 0; browser tests prove restart/re-review; Git test proves no checkout or worktree mutation.

- [ ] **Step 5: Record evidence, re-freeze, commit, and push**

Write the RED/GREEN findings, actual repair behavior, lock/identity/operation evidence, residual limitations, and command output summary. Update `docs/progress.md` to re-establish code freeze. Commit: `docs: complete foundation hardening`.

## Explicit non-goals

- A hosted service, daemon, job queue, generic retry framework, account system, telemetry, background indexing, or multi-project selector.
- GitHub publication, target-repository mutation, branch/range review, checkout/reset behavior, or model-generated verdicts.
- Automatic deletion of valid reviews, automatic reset of Project Memory, or source/diff disclosure during diagnostics/repair.

## Self-review

- Every audit finding maps to one task and a red/green regression test.
- The additions are native lock/map/SQLite primitives, one needed schema column, and one explicit local repair command; no dependency or plugin system is introduced.
- The plan preserves the fixed-repository and foreground-only product boundary while making its failure behavior explicit and recoverable.

## Execution prompt

> Read `GATEKEEPER_COMPLETE_CODEX_SPEC.md`, `gatekeeper_codex_build_pack/GATEKEEPER_HACKATHON_PHASED_EXECUTION_PLAN.md`, `docs/progress.md`, and this plan. The user has explicitly authorized this post-freeze Foundation Hardening extension. Execute one task at a time with test-first development and Ponytail at full intensity. Commit and push each verified task to `origin/master`; do not add a worker, queue, hosted service, GitHub write, target-repository mutation, or dependency. Stop only after Task 5 passes the complete release matrix and re-establishes code freeze.
