# Phase 3 SQLite Project Memory implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `executing-plans` task by task. The canonical hackathon plan forbids delegation unless the user explicitly requests it, so this plan executes inline. Every behavior step uses test-driven development.

**Goal:** Give Gatekeeper durable, incremental, evidence-addressable repository memory through SQLite/FTS5 and expose the same persisted records through CLI, localhost API, and dashboard.

**Architecture:** `packages/project-memory` owns repository identity, bounded source selection, incremental indexing, and retrieval policy behind a narrow `ProjectMemory` interface. `packages/store-sqlite` is the only SQLite/Drizzle adapter; applications compose it with the existing Git adapter, while contracts remain Zod-first and presentation adapters contain no persistence rules.

**Tech Stack:** Node.js 24, strict TypeScript ESM, pnpm workspaces, Zod 4, execa argument arrays, better-sqlite3 12.11.1, Drizzle ORM 0.45.2, Drizzle Kit 0.31.10, SQLite FTS5, Commander, Fastify 5, React 19, TanStack Query 5, React Router 8, CSS Modules, Vitest, and Testing Library.

## Global constraints

- Execute canonical hackathon Phase 3 only; stop before MCP, the Codex skill, GitHub network access, embeddings, model findings, pull-request review, background jobs, or a generic plugin system.
- Store one machine-local database at `<app-data>/storage/gatekeeper.db`; never write Gatekeeper state into a target repository.
- Use the Drizzle TypeScript schema for ordinary tables and one reviewed versioned SQL migration for `document_fts` plus insert/update/delete triggers.
- Enable WAL and foreign keys for file databases and fail with a stable actionable error when better-sqlite3, migrations, writability, or FTS5 is unavailable.
- Persist tracked metadata and hashes, selected Markdown/ADR content, repository policy, bounded commit metadata/messages, review runs, findings, and evidence pointers; never persist raw diffs or full private source files.
- Evidence excerpts and stored search units are at most 2,000 characters. Repository content is labelled `untrusted_repository_content` and is never treated as instruction or rendered as HTML.
- Deny common credential files even if tracked. Honor `.gitignore` through Git's tracked snapshot, plus `.gatekeeperignore` and policy ignore patterns.
- Index at most 200 recent commits, read at most 256 KiB per selected document, and keep every Git subprocess output bounded to 2 MiB with a 30-second timeout.
- Exact source/path/title lookup precedes escaped FTS5 lexical search. User text is validated, bounded, and never interpolated as SQL.
- Unchanged files and commits produce no rewrites; a changed or deleted file invalidates only records derived from that path.
- CLI and HTTP inputs use registered repository IDs or the service's fixed startup repository; neither accepts a database path, arbitrary file-read path, or shell command.
- Use the existing dark graphite design system and formal IBM Plex Sans typography. Add no UI, chart, animation, state, or styling dependency.
- Each green task is committed and pushed to `origin/codex/phase-3-project-memory`. Only after the complete phase gate and aggressive audit pass is the branch merged into `master` and `origin/master` pushed; no red or partial state is published to master.

## File map

- `packages/contracts/src/memory.ts`: strict serialized repository, index, search, and review-read contracts plus draft-7 API schemas.
- `packages/git-adapter/src/project-memory-source.ts`: bounded `HEAD` tree, file-at-ref, and recent-commit extraction through Git argument arrays.
- `packages/project-memory/src/project-memory.ts`: stable identity, document selection/chunking, incremental orchestration, search, and review persistence boundary.
- `packages/store-sqlite/src/schema.ts`: Drizzle ordinary-table schema.
- `packages/store-sqlite/drizzle/0000_project_memory.sql`: reviewed schema migration including FTS5 and synchronization triggers.
- `packages/store-sqlite/src/sqlite-project-store.ts`: concrete migrations, transactions, incremental writes, exact/FTS search, and review reads.
- `apps/cli/src/project-memory.ts`: short-lived local composition for repository/index/search/review commands.
- `apps/server/src/server.ts`: authenticated fixed-repository Project Memory endpoints.
- `apps/dashboard/src/routes/memory-route.tsx`: memory search states and trust-labelled evidence results.
- `apps/dashboard/src/routes/review-detail-route.tsx`: persistent review deep link.
- `demo/prepare-fixtures.ts`: idempotent `history` Git fixture with Redis ADR and commit evidence.
- `docs/development/phase-3-execution-log.md`: RED/GREEN, unexpected-failure, correction, and verification ledger.

---

### Task 1: Storage contracts, schema, migrations, and capabilities

**Files:**

- Create: `packages/contracts/src/memory.ts`
- Create: `packages/contracts/src/memory.test.ts`
- Create: `packages/store-sqlite/package.json`
- Create: `packages/store-sqlite/tsconfig.json`
- Create: `packages/store-sqlite/drizzle.config.ts`
- Create: `packages/store-sqlite/src/schema.ts`
- Create: `packages/store-sqlite/src/sqlite-project-store.ts`
- Create: `packages/store-sqlite/src/sqlite-project-store.test.ts`
- Create: `packages/store-sqlite/src/index.ts`
- Create: `packages/store-sqlite/drizzle/0000_project_memory.sql`
- Create: `packages/store-sqlite/drizzle/meta/_journal.json`
- Modify: root workspace TypeScript/Vitest aliases and references
- Modify: `pnpm-workspace.yaml`, package manifests, and `pnpm-lock.yaml`

**Interfaces:**

```ts
interface RepositoryRecord {
  schemaVersion: 1;
  repositoryId: string;
  root: string;
  remote: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MemorySearchInput {
  schemaVersion: 1;
  repositoryId: string;
  query: string;
  limit?: number;
}

interface MemorySearchResult {
  documentId: string;
  match: 'exact' | 'fts';
  trust: 'untrusted_repository_content';
  evidence: EvidencePointer;
}

function openSqliteProjectStore(options: {
  databasePath: string;
  migrationsFolder?: string;
}): SqliteProjectStore;
```

- [ ] Write RED contract tests for strict unknown-field rejection, query length/limit bounds, 2,000-character excerpts, ISO timestamps, trust labels, and draft-7 JSON schema registration IDs.
- [ ] Write RED real-database tests for new migration, WAL, foreign keys, required tables, `document_fts`, migration journal, idempotent reopen, trigger synchronization, transactional review persistence, and stable safe migration errors.
- [ ] Run `pnpm test packages/contracts/src/memory.test.ts packages/store-sqlite/src/sqlite-project-store.test.ts`; verify failures are missing exports/packages.
- [ ] Add only the mandated pinned dependencies, permit only better-sqlite3's native build, generate the ordinary schema migration, then review and add FTS5 SQL/triggers.
- [ ] Implement one concrete store with prepared/bound statements, transactions, close semantics, capability probes, exact-before-FTS search, and Zod parsing on serialized reads.
- [ ] Add adversarial tests for malformed FTS syntax, wildcard-heavy input, duplicate IDs, foreign-key failure, interrupted migration, FTS trigger drift, and corrupt stored review JSON; return stable errors without source content.
- [ ] Run focused tests and full lint/typecheck/test/build/format/audit gates.
- [ ] Commit and push `feat(store): add SQLite project-memory persistence`.

### Task 2: Bounded Git indexing sources

**Files:**

- Create: `packages/contracts/src/project-source.ts`
- Create: `packages/contracts/src/project-source.test.ts`
- Create: `packages/git-adapter/src/project-memory-source.ts`
- Create: `packages/git-adapter/src/project-memory-source.test.ts`
- Modify: `packages/git-adapter/src/git-provider.ts`
- Modify: `packages/git-adapter/src/index.ts`

**Interfaces:**

```ts
interface TrackedFileRecord {
  path: string;
  objectId: string;
  mode: string;
  sizeBytes: number | null;
}

interface GitCommitRecord {
  sha: string;
  authoredAt: string;
  title: string;
  message: string;
}

interface GitProvider {
  listTrackedFiles(repositoryPath: string): Promise<TrackedFileRecord[]>;
  listCommits(repositoryPath: string, limit: number): Promise<GitCommitRecord[]>;
  readFileAtRef(repositoryPath: string, relativePath: string, ref: string): Promise<string>;
}
```

- [ ] Write RED temporary-repository tests for unusual safe paths, symlinks, deleted files, bounded blobs, non-UTF-8 rejection, commit-message truncation, hostile commit text, maximum count, malformed NUL records, timeout, and max-buffer failures.
- [ ] Implement `git ls-tree -r -z --long HEAD`, bounded NUL-framed `git log`, and `git show HEAD:<validated-path>` through the existing injected runner and argument arrays.
- [ ] Keep path/ref validation at the adapter boundary; never concatenate a shell command and never follow a repository symlink.
- [ ] Run focused and root gates, record evidence, then commit and push `feat(git): expose bounded memory sources`.

### Task 3: Incremental Project Memory indexing and retrieval

**Files:**

- Create: `packages/project-memory/package.json`
- Create: `packages/project-memory/tsconfig.json`
- Create: `packages/project-memory/src/project-memory.ts`
- Create: `packages/project-memory/src/project-memory.test.ts`
- Create: `packages/project-memory/src/index.ts`
- Modify: workspace TypeScript/Vitest aliases and references

**Interface:**

```ts
interface ProjectMemory {
  migrate(): Promise<void>;
  registerRepository(input: RegisterRepositoryInput): Promise<RepositoryRecord>;
  indexLocalRepository(input: LocalIndexInput): Promise<IndexResult>;
  search(input: MemorySearchInput): Promise<MemorySearchResult[]>;
  saveReview(review: ReviewRun): Promise<void>;
  getReview(reviewId: string): Promise<ReviewRun | null>;
}
```

- [ ] Write RED tests for normalized local/HTTPS/SSH identity, first index, zero-write unchanged index, one-ADR invalidation, deletion, bounded chunks, selected-document rules, policy indexing, recent commits, exact-first ordering, Redis FTS retrieval, trust labels, and repository isolation.
- [ ] Add RED privacy cases for `.gatekeeperignore`, policy ignores, tracked `.env`, PEM/private-key names, credential/config files, oversized docs, binary docs, traversal-like paths, and prompt-injection text remaining inert data.
- [ ] Implement deterministic identity from normalized remote when present and normalized canonical root otherwise; use SHA-256 application IDs without exposing SQLite row IDs.
- [ ] Implement source selection and chunks in the application package, then submit one transactional index batch to the store. Use hashes to avoid unchanged writes and path-scoped deletes to invalidate only changed evidence.
- [ ] Search exact source ID/path/title first, then escaped FTS5, deduplicate by document ID, preserve ranking order, and return only bounded `EvidencePointer` values.
- [ ] Run focused tests, root gates, and audit; record evidence, then commit and push `feat(memory): index and retrieve repository evidence`.

### Task 4: Doctor, CLI, and deterministic history fixture

**Files:**

- Create: `apps/cli/src/project-memory.ts`
- Create: `apps/cli/src/project-memory.test.ts`
- Modify: `apps/cli/src/index.ts`
- Modify: `apps/cli/src/doctor.ts`
- Modify: `apps/cli/src/doctor.test.ts`
- Modify: `apps/cli/src/worktree-review.ts`
- Modify: `demo/prepare-fixtures.ts`
- Modify: package manifests and references

**CLI contract:**

```text
gatekeeper repo init [path] --format human|json
gatekeeper repo status [path] --format human|json
gatekeeper index [path] --format human|json
gatekeeper memory search <query> [path] --format human|json
gatekeeper review show <review-id> --format human|json
```

- [ ] Write RED tests for each command's happy, not-initialized, invalid-query, migration, indexing, not-found, and safe exit-code paths; JSON output must parse through shared contracts.
- [ ] Extend Doctor with required `betterSqlite3`, `database`, and `fts5` checks using injected probes in tests; missing or unwritable storage fails with actionable repair text and no path/content leakage beyond the configured app-data path.
- [ ] Compose short-lived store/Project Memory sessions in CLI, always close in `finally`, and persist `review worktree` results with an explicit previous-review relationship when available.
- [ ] Add an idempotent `history` fixture containing an active no-required-Redis ADR, selected documentation, bounded commit history, ignored content, and a worktree change with its required test.
- [ ] Run fixture generation twice and exact CLI acceptance commands twice; the second index must report `documentsWritten: 0`, search must return ADR and commit evidence, and the review must be retrievable by ID.
- [ ] Run root gates/audit, record evidence, then commit and push `feat(cli): manage durable project memory`.

### Task 5: Fixed-repository memory and persistent-review API

**Files:**

- Modify: `packages/contracts/src/memory.ts`
- Modify: `apps/server/src/server.ts`
- Modify: `apps/server/src/server.test.ts`
- Modify: `apps/server/src/service.ts`
- Modify: `apps/server/src/service.test.ts`
- Modify: `apps/cli/src/start.ts`
- Modify: `apps/cli/src/start.test.ts`

**Endpoints:**

```text
POST /v1/repositories                         body {}
GET  /v1/repositories/:repositoryId
POST /v1/repositories/:repositoryId/index    body {}
GET  /v1/repositories/:repositoryId/memory/status
POST /v1/memory/search                       body MemorySearchInput
GET  /v1/reviews/:reviewId
```

- [ ] Write RED API tests for bearer auth, strict inputs, fixed repository containment, wrong IDs, not-found responses, bounded search, persisted review reads, safe store failures, and response schema registration.
- [ ] Initialize/migrate/register one Project Memory instance before listen, inject application callbacks into Fastify, update status to truthful memory state, and close the database after Fastify on shutdown.
- [ ] Make `POST /v1/reviews/worktree` persist before responding and attach the latest same-target review ID when one exists.
- [ ] Add a restart integration test: start, save/review, close, reopen the same database, and read the identical strict ReviewRun.
- [ ] Run focused and root gates/audit, record evidence, then commit and push `feat(server): expose persistent project memory`.

### Task 6: Project Memory dashboard and persistent review routes

**Files:**

- Create: `apps/dashboard/src/api/memory-client.ts`
- Create: `apps/dashboard/src/api/memory-client.test.ts`
- Create: `apps/dashboard/src/routes/memory-route.tsx`
- Create: `apps/dashboard/src/routes/review-detail-route.tsx`
- Modify: `apps/dashboard/src/api/review-client.ts`
- Modify: `apps/dashboard/src/app/dashboard-app.tsx`
- Modify: `apps/dashboard/src/app/dashboard-app.test.tsx`
- Modify: `apps/dashboard/src/components/app-shell.tsx`
- Modify: `apps/dashboard/src/styles/dashboard.module.css`
- Modify: `apps/server/src/server.ts`

- [ ] Write RED client/component tests for initial, searching, empty, result, retryable error, malformed response, persistent review, and not-found states. Evidence trust/source/match/path/date must be text, never color-only.
- [ ] Implement a native search form backed by one TanStack mutation, semantic result list, bounded plain-text excerpts, and links only to safe local persistent-review routes; use no effect, HTML injection, debounce helper, or global state.
- [ ] Replace the unavailable Memory navigation item with `/memory` and add exact static entry routes for `/memory` and `/reviews/:reviewId` without a generic server catch-all.
- [ ] Reuse the existing dark graphite typography/tokens; audit keyboard order, focus, 320-pixel containment, reduced motion, empty/error language, and long hostile strings.
- [ ] Run dashboard/server tests, root gates, Impeccable, web-design accessibility review, desktop/narrow browser review, and console audit.
- [ ] Record evidence, then commit and push `feat(dashboard): browse durable project memory`.

### Task 7: Aggressive break audit, documentation, acceptance, and integration

**Files:**

- Create: `docs/architecture/storage.md`
- Create: `docs/architecture/indexing.md`
- Create: `docs/development/migrations.md`
- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/reference/cli.md`
- Modify: `docs/reference/local-api.md`
- Create: `docs/reference/storage-schema.md`
- Modify: `docs/development/phase-3-execution-log.md`
- Modify: `docs/progress.md`

- [ ] Reconcile every canonical Phase 3 build/test/acceptance bullet with code and record any deliberate limitation.
- [ ] Run adversarial suites for migration interruption, concurrent opens, database corruption, FTS syntax, Unicode/long input, ignored secrets, symlink/traversal, malicious document text, deletion, stale index state, restart, failed callbacks, and log/output redaction; reproduce every new finding with a RED regression before fixing it.
- [ ] Run a whole-diff backend/security review, frontend/accessibility review, and Ponytail over-engineering audit; delete unjustified abstractions and resolve every material finding.
- [ ] Document schema, migration recovery, indexing bounds, privacy behavior, CLI/API contracts, errors/failures, and the Phase 4 stop gate.
- [ ] Run fresh `pnpm install --frozen-lockfile`, lint, typecheck, test, build, format check, audit, fixture generation twice, every exact Phase 3 CLI acceptance command, live API restart verification, dashboard desktop/narrow review, and browser console audit.
- [ ] Update `docs/progress.md`, commit and push `docs(phase-3): record verified completion`, and verify the feature worktree is clean.
- [ ] Merge the verified branch into local `master` without rewriting history, rerun the complete quality/acceptance gate on the merge result, push `origin/master`, and verify `master === origin/master` with a clean worktree.

## Stop gate

Phase 3 ends when a registered history fixture indexes incrementally, Redis search returns bounded ADR and commit evidence, a worktree review persists and survives service restart, CLI/API/dashboard agree on strict contracts, and all aggressive tests pass. Do not create MCP, Codex-skill, GitHub-sync, pull-request-review, embedding, model-reasoning, permanent-decision, background-job, or publication code.
