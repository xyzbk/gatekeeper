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

| Task                                  | State    | Commit    | Verification                         | Failures and corrections  |
| ------------------------------------- | -------- | --------- | ------------------------------------ | ------------------------- |
| 1. Storage contracts and migrations   | complete | 4d19aad   | Root gates: 22 files, 115 tests PASS | See Task 1 evidence below |
| 2. Bounded Git indexing sources       | complete | c41a79c   | Root gates: 24 files, 122 tests PASS | See Task 2 evidence below |
| 3. Incremental indexing and retrieval | complete | this step | Root gates: 25 files, 130 tests PASS | See Task 3 evidence below |
| 4. Doctor, CLI, and fixture           | pending  | —         | —                                    | —                         |
| 5. Persistent local API               | pending  | —         | —                                    | —                         |
| 6. Dashboard memory and review routes | pending  | —         | —                                    | —                         |
| 7. Aggressive acceptance and docs     | pending  | —         | —                                    | —                         |

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

## Scope boundary

No MCP server, Codex skill, GitHub call, pull-request review, embedding, model finding, background job, or publication behavior belongs in this phase.
