# Phase 3 execution log

Status: IN PROGRESS

Started: 2026-07-18

Goal: deliver canonical SQLite Project Memory and evidence retrieval, then stop before MCP, Codex skill, GitHub, embeddings, or model reasoning.

## Working rules

- Every behavior begins with a focused failing test and is fixed at the root cause.
- Expected RED failures, unexpected failures, security findings, and corrections are recorded without copying repository content, source, diffs, tokens, or secrets.
- Ponytail full intensity applies: mandated SQLite/Drizzle are the only new storage dependencies; no worker, queue, cache, repository abstraction, generic plugin system, or speculative adapter is added.
- Each passing task commit is pushed to `origin/codex/phase-3-project-memory`. `master` is updated only after the complete phase and aggressive audit pass.

## Baseline

The repository began Phase 3 clean at `6fadd2c1d0843ab1c0d5a022b53b1bb8c73a0952`; local `master` equalled `origin/master`.

```text
pnpm install --frozen-lockfile  PASS — already up to date, pnpm 11.9.0
pnpm test                       PASS — 20 files, 101 tests
```

The requested feature branch is `codex/phase-3-project-memory`.

## Pre-change findings and corrections

- The first checkout diagnostic assumed that `git rev-parse --show-superproject-working-tree` returns an empty string in a normal checkout. PowerShell returned no object, so `.Trim()` failed. A raw-value probe confirmed a null value with Git exit code 0; the corrected diagnostic handles the absent value explicitly.
- A follow-up diagnostic attempted to pipe directly from a `foreach` statement, which this PowerShell parser rejected as an empty pipe element. Assigning the loop output before piping produced the intended evidence. These were read-only command-script failures; no project file changed.
- The long-term specification labels MCP as Phase 3, but the canonical hackathon plan labels SQLite Project Memory as Phase 3. `AGENTS.md` gives the hackathon plan precedence, so this execution stops before MCP.
- The first documentation gate found only Prettier table-spacing drift in this new log. The repository formatter corrected it without changing the plan or product behavior.

## Dependency evidence

- Registry metadata on 2026-07-18 reports `better-sqlite3` 12.11.1 with Node 24 support, `@types/better-sqlite3` 7.6.13, `drizzle-orm` 0.45.2, and `drizzle-kit` 0.31.10.
- Official Drizzle documentation confirms the `drizzle-orm/better-sqlite3` driver and code-first migration workflow.
- Official better-sqlite3 documentation recommends WAL for normal file databases.
- Official SQLite documentation confirms external-content FTS5 tables require synchronization triggers and documents index rebuild behavior.

## Task ledger

| Task                                  | State       | Commit    | Verification                         | Failures and corrections  |
| ------------------------------------- | ----------- | --------- | ------------------------------------ | ------------------------- |
| 1. Storage contracts and migrations   | complete    | 4d19aad   | Root gates: 22 files, 115 tests PASS | See Task 1 evidence below |
| 2. Bounded Git indexing sources       | complete    | c41a79c   | Root gates: 24 files, 122 tests PASS | See Task 2 evidence below |
| 3. Incremental indexing and retrieval | complete    | a9c3077   | Root gates: 25 files, 130 tests PASS | See Task 3 evidence below |
| 4. Doctor, CLI, and fixture           | complete    | f07210a   | Root gates: 26 files, 137 tests PASS | See Task 4 evidence below |
| 5. Persistent local API               | complete    | 762a514   | Root gates: 26 files, 144 tests PASS | See Task 5 evidence below |
| 6. Dashboard memory and review routes | complete    | 262a308   | Root gates: 27 files, 153 tests PASS | See Task 6 evidence below |
| 7. Aggressive acceptance and docs     | in progress | this step | Shuffled: 27 files, 156 tests PASS   | See Task 7 evidence below |

## Task 1 evidence

Expected RED:

- The contract suite failed because `memory.ts` did not exist.
- The store suite failed because better-sqlite3 and `sqlite-project-store.ts` did not exist.
- A missing-repository index batch exposed a raw SQLite foreign-key error instead of a stable adapter error.
- A missing-repository review write exposed the same raw database error path.

Corrections and learning:

- A source-inspection command used a wildcard inside a Windows path passed to `rg`; Windows did not expand it. Locating the pnpm package directory first and reading through the workspace symlink exposed the installed Drizzle types without changing code.
- The Drizzle-generated migration used a whimsical generated tag. It was renamed to the stable `0000_project_memory` tag before review, then the FTS5 table and three synchronization triggers were added explicitly.
- The first repository registration passed adapter-only normalized identity fields into the strict public repository schema. The adapter now validates only the public projection and stores normalized fields separately.
- That early assertion failure left database handles open and produced secondary Windows `EBUSY` cleanup errors. The tests now register every opened store for unconditional `afterEach` closure, so future failures retain the primary signal.
- The first FTS update assertion expected a Redis query to disappear after only the excerpt changed, but Redis remained intentionally present in the title, source ID, and path. The corrected test changes every indexed column and proves the update trigger removes all old terms.
- Index and review transactions now translate driver failures into stable `INDEX_WRITE_FAILED` and `REVIEW_WRITE_FAILED` errors; transaction rollback tests prove no partial record remains.
- better-sqlite3 installed its Node 24 prebuild successfully. Its installer emitted Node's `fs.R_OK` deprecation warning through the upstream `prebuild-install` path; product code does not use that API.
- The first root lint found two empty row interfaces; direct type aliases express the same database-row shape without lint suppression.
- The first audit found one moderate development-only esbuild advisory through Drizzle Kit's legacy `@esbuild-kit/esm-loader` dependency. The reviewed migration had already been generated, while runtime migration uses `drizzle-orm`; keeping the generator installed added vulnerability without product capability. Drizzle Kit and its config/script were removed after generation, pruning the unused toolchain and advisory. Future schema changes must deliberately install the then-current pinned generator, regenerate, review the SQL, and remove it again.
- The first format check found only the generated Drizzle snapshot and updated lockfile. Both are formatted normally and no generated-file exception is added.

Focused result:

```text
Project Memory contracts                         PASS — 4 tests
SQLite migrations/capabilities/index/reviews     PASS — 10 tests
Total                                            PASS — 14 tests
```

Task gate:

```text
pnpm install --frozen-lockfile   PASS — already up to date
pnpm lint                        PASS
pnpm typecheck                   PASS
pnpm test                        PASS — 22 files, 115 tests
pnpm build                       PASS
pnpm format:check                PASS
pnpm audit --audit-level high    PASS — no known vulnerabilities
```

## Task 2 evidence

Expected RED:

- Contract and adapter suites failed because the Git-source contracts and `project-memory-source.ts` did not exist.
- The first implementation returned empty file bodies because unnecessary `git show --format=` options suppress blob output.
- Unsafe tree paths and malformed commit fields initially escaped as detailed Zod errors instead of stable adapter failures.

Corrections and learning:

- A direct Git probe confirmed that `git show --no-textconv HEAD:<path>` returns the blob while adding `--format=` returns no body. The adapter now uses only the required option and the strictly validated object specifier.
- Re-sorting `git ls-tree` output with locale-aware comparison changed its deterministic byte ordering. The redundant sort was deleted and native Git order is preserved.
- Strict contract failures for untrusted path/commit metadata are now translated to `MALFORMED_GIT_OUTPUT`, so error surfaces do not echo repository content.
- Real repositories prove the 256 KiB document limit, invalid UTF-8 denial, 2,000-character commit-message bound, and literal handling of a commit subject that asks the tool to ignore policy and run a command.
- The first root lint found six injected Promise-returning runners unnecessarily marked `async`. Returning `Promise.resolve(...)` expresses those test doubles exactly and no lint exception was added.

Focused result:

```text
Git-source contracts                     PASS — 2 tests
Committed tree/file/history adapter       PASS — 5 tests
Total                                    PASS — 7 tests
```

Task gate:

```text
pnpm lint                        PASS
pnpm typecheck                   PASS
pnpm test                        PASS — 24 files, 122 tests
pnpm build                       PASS
pnpm format:check                PASS
pnpm audit --audit-level high    PASS — no known vulnerabilities
```

## Task 3 evidence

Expected RED:

- The focused suite initially failed because the Project Memory orchestration package did not exist.
- Repository documentation could not satisfy the shared evidence contract because the evidence source enum omitted `documentation`.

Corrections and learning:

- Spreading a class-backed store fixture erased its prototype methods. The test persistence probe now delegates methods explicitly and every opened database is closed unconditionally.
- Git accepts commit timestamps with offsets, while the memory contract requires normalized timestamps. Commit evidence is normalized to UTC at the Project Memory boundary.
- A repository-isolation fixture accidentally put the search term in the second repository's path. The corrected fixture proves isolation using an unrelated path and content.
- An ignore-order assertion assumed sorting that the adapter intentionally does not perform. The test now verifies the deterministic policy, Gatekeeper, and Git ignore precedence actually passed to the source.
- `documentation` was added to the shared evidence source enum and the checked-in verdict schema was regenerated, keeping serialized contracts aligned.
- The first lint pass found injected Promise-returning fakes marked `async` without awaiting. Exact `Promise.resolve` and `Promise.reject` returns removed the noise without suppressions.

Behavior proven:

- Remote-first stable repository identity and first-seen preservation across equivalent GitHub SSH and HTTPS remotes.
- Incremental first, unchanged, changed, and deleted indexing with zero rewrites for an unchanged tree and path-scoped replacement for changed documents.
- Markdown chunking capped at 2,000 characters, bounded policy excerpts, secret denial, layered ignore rules, regular-file enforcement, UTF-8 and size limits, and repository isolation.
- Exact matches precede FTS matches; ADR, documentation, policy, and bounded commit evidence remain explicitly untrusted repository content.
- Prompt-like repository text remains inert data and is never interpreted as an instruction.

Focused result:

```text
Project Memory identity/index/search/review behavior   PASS — 7 tests
Documentation evidence contract                        PASS — included in contract suite
```

Task gate:

```text
pnpm lint                        PASS
pnpm typecheck                   PASS
pnpm test                        PASS — 25 files, 130 tests
pnpm build                       PASS
pnpm format:check                PASS
pnpm audit --audit-level high    PASS — no known vulnerabilities
```

## Task 4 evidence

Expected RED:

- Database-path, SQLite/FTS5 Doctor, repository-status, previous-review, CLI lifecycle, and Project Memory command suites failed before their behavior existed.
- The first CLI test command omitted the repository Vitest configuration, so package imports resolved stale build output and produced a false missing-export failure. Re-running through `vitest.workspace.ts` exposed only the intended RED failures.

Corrections and learning:

- The CLI TypeScript project initially lacked references to its new Project Memory and SQLite dependencies. Explicit project references restored build boundaries without widening source roots.
- The first lint pass rejected a dynamic-import type annotation and an unbound mocked method assertion. Inferred module typing and a directly named spy fixed both without suppressions.
- The first complete format gate found only the updated lockfile. Formatting it and rerunning every root gate produced a fully green state.
- Doctor reports the optional missing `gh` client as degraded, while native SQLite, database WAL, and FTS5 remain required. The acceptance machine therefore returned a healthy Project Memory probe with an expected overall degraded status.

Behavior proven:

- The database resolves under Gatekeeper machine app-data storage, outside the target repository by default.
- `repo init`, `repo status`, `index`, `memory search`, persisted `review worktree`, and `review show` use short-lived sessions that close in `finally`.
- Not-initialized, not-found, invalid-input, Git/environment, migration, index, and internal failures map to stable exit categories without echoing private details.
- The disposable history fixture recreates idempotently with a reverted required-Redis proposal, active ADR, selected documentation, tracked denied secret, ignored document, and source-plus-test worktree change.
- Source and compiled CLI runs both wrote six evidence documents on the first index and zero on the unchanged second index. Redis search returned ADR, commit, and documentation evidence; the saved `FAST_PATH` review reopened in a new process, and a second review linked to the first by `previousReviewId`.

Task gate:

```text
pnpm fixtures:prepare (twice)   PASS — 4 deterministic repositories
source CLI acceptance           PASS — second document writes 0; review round trip true
compiled CLI acceptance         PASS — second document writes 0; ADR + commit evidence
pnpm install --frozen-lockfile  PASS
pnpm lint                       PASS
pnpm typecheck                  PASS
pnpm test                       PASS — 26 files, 137 tests
pnpm build                      PASS
pnpm format:check               PASS
pnpm audit --audit-level high   PASS — no known vulnerabilities
```

## Task 5 evidence

Expected RED:

- The status contract rejected a ready Project Memory state, route parameter contracts did not exist, all repository/index/search/review-read endpoints returned 404, and the server lacked their shared response schemas.
- Making Project Memory required at the HTTP boundary correctly broke the existing service composition until lifecycle ownership was added.

Corrections and learning:

- The server project needed explicit references to domain types, Git indexing, Project Memory, and SQLite after taking ownership of the durable lifecycle.
- TypeScript correctly rejected a mutable optional server reference captured by the close callback. Capturing the successfully built instance in a local constant made the close order explicit.
- The first restart-test lint pass found an import-expression type and untyped Fastify JSON values. Static type imports and parsing responses through the shared ReviewRun schema removed both unsafe paths without suppressions.
- A dependency lock refresh produced mechanical ordering churn after the prior formatting pass. Formatting the final lockfile only after dependency resolution restored a minimal, reproducible final state.

Behavior proven:

- The service migrates SQLite and registers exactly one normalized repository before binding to `127.0.0.1`; status reports Project Memory ready.
- Repository registration/read, incremental index, memory status, bounded memory search, persisted review read, and worktree review all require bearer authentication and strict shared contracts.
- Wrong repository IDs return `NOT_FOUND` before index/search callbacks run, and no route accepts a path or alternate repository selector.
- Review persistence completes before the POST response. A complete Fastify/database close followed by reopening the same database returned the identical review, and the next review linked to it.
- Injected Project Memory failures returned stable internal envelopes and logs contained only bounded operation metadata.
- A live compiled-service acceptance against the deterministic history fixture wrote six documents once, wrote zero on the second index, returned ADR/commit/documentation evidence, persisted a `FAST_PATH` review, and read it back through HTTP.

Task gate:

```text
focused contract/server/start tests       PASS — 35 tests
restart integration                       PASS — persisted read + previousReviewId
compiled live API acceptance              PASS — second writes 0; review round trip true
pnpm install --frozen-lockfile             PASS
pnpm lint                                  PASS
pnpm typecheck                             PASS
pnpm test                                  PASS — 26 files, 144 tests
pnpm build                                 PASS
pnpm format:check                          PASS
pnpm audit --audit-level high              PASS — no known vulnerabilities
```

## Task 6 evidence

Expected RED:

- Project Memory had no dashboard API client or route, persisted reviews had no read client or route, and the static service returned 404 for both direct-entry paths.
- The first route-state tests failed across initial, pending, error, empty, result, not-found, and persisted-review rendering states before those components existed.

Corrections and learning:

- The first date formatter combined `dateStyle` and `timeStyle` with `timeZoneName`, which the test runtime correctly rejects. Explicit year, month, day, hour, minute, and time-zone options produce the same readable UTC timestamp without relying on an invalid option combination.
- The first live visual pass exposed stale Phase 2 copy describing completed reviews as ephemeral and made reopening a saved run unnecessarily indirect. The completed state now says that the review is persisted in Project Memory, shows its stable ID, and links directly to the stored-review route.
- Rebuilding dashboard assets while the already-running Fastify process retained its explicit static asset registrations produced a blank reload. Restarting the local service loaded the new immutable asset filenames; this is expected for the foreground build/start workflow and required no runtime watcher or speculative asset fallback.
- Impeccable's product register had no saved product context, so the existing Phase 1/2 Gatekeeper visual system remained authoritative. The implementation preserves its IBM Plex Sans typography, graphite palette, restrained separators, explicit state hierarchy, and no-gradient/no-chat/no-motion rules.

Behavior proven:

- Project Memory search uses one bounded mutation, validates every response, renders repository excerpts as plain text, and exposes source, exact-or-FTS match, trust label, occurrence time, and optional path without interpreting content.
- The memory view has distinct initial, pending, retryable-error, empty, and result states; the persisted-review view has pending, retryable-error, not-found, and strict ReviewRun states.
- Review completion exposes the persisted review ID and a direct reopen action. Refreshing `/reviews/:reviewId` is served by Fastify and reads the same run through the authenticated durable API.
- Live compiled-service inspection at 1440×900 and 375-pixel widths exercised index-backed Redis search and the complete review-to-reopen flow with no page-wide horizontal overflow.

Focused result:

```text
Dashboard route/client suites             PASS — 4 files, 33 tests
Server static-entry/API suites            PASS
Dashboard production build                PASS
```

Task gate:

```text
pnpm install --frozen-lockfile  PASS
pnpm lint                       PASS
pnpm typecheck                  PASS
pnpm test                       PASS — 27 files, 153 tests
pnpm build                      PASS
pnpm format:check               PASS
pnpm audit --audit-level high   PASS — no known vulnerabilities
```

## Task 7 evidence

Failure-path audit:

- Existing tests already prove fresh and idempotent migrations, interrupted-migration rollback, FTS5 insert/update/delete synchronization, hostile FTS syntax handling, ignored/secret/symlink/oversized denial, review transaction rollback, corrupt-review fail-closed behavior, service restart persistence, and bounded logs without paths, source, diffs, tokens, or database details.
- A new unusable-parent-path test confirms database startup returns stable `DATABASE_OPEN_FAILED` guidance rather than a raw filesystem error.
- Two shuffled whole-workspace runs with seeds `31001` and `99173` passed all 27 files and 156 tests, ruling out observed file/test order dependencies.

Unexpected RED and root-cause corrections:

- A forged index batch reused a global document ID from another repository. SQLite kept the original owner but the upsert replaced its document fields and let the second index report a write. The document upsert now updates only when repository ownership matches, checks the affected-row count inside the immediate transaction, and returns stable `INVALID_INDEX_BATCH`; regression assertions prove earlier file writes roll back and neither repository is corrupted.
- A forged review reused an ID owned by another repository and could move the stored run. The review upsert now has the same repository-ownership predicate and affected-row check; the immediate transaction preserves the original run and returns stable `REVIEW_WRITE_FAILED`.
- The first review-ownership fix accidentally checked an undeclared result because the prepared statement result had not been assigned. The focused suite exposed it immediately; assigning the native better-sqlite3 result fixed the implementation without adding a wrapper.

Ponytail review:

- The phase diff uses only the mandated SQLite/Drizzle runtime additions and the already-installed application stack. Package boundaries, the focused schema (including the future-populated but plan-mandated `document_links` table), and injected inward-facing interfaces match the canonical plan. No dependency, speculative worker, cache, generic repository layer, or plugin mechanism can be removed without deleting required Phase 3 behavior. Lean already.

Compiled acceptance against a fresh app-data root:

```text
first index document writes     6
second index file writes        0
second index document writes    0
second index commit writes      0
search source types             adr, commit, documentation
all search trust labels         untrusted_repository_content
worktree verdict                FAST_PATH
stored review round trip        true
```

## Scope boundary

No MCP server, Codex skill, GitHub call, pull-request review, embedding, model finding, background job, or publication behavior belongs in this phase.
