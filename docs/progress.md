# Build progress

## Phase 0 completion report

Phase: Repository foundation and enforceable contracts

Status: COMPLETE

### Implemented

- Initialized Git, configured `origin` for `https://github.com/xyzbk/gatekeeper.git`, and prepared the verified Phase 0 milestone for `master`.
- Created the Node 24/pnpm strict TypeScript ESM workspace with project references.
- Added branded IDs, review entities, authorities, verdicts, and deterministic verdict assembly.
- Added strict Zod verdict and error contracts with a synchronized draft-2020-12 JSON Schema.
- Added strict policy v1 YAML validation with actionable issue paths.
- Added cross-platform user app-data path resolution.
- Added CLI version/help and offline Doctor checks.
- Added deterministic, network-free tests and a minimal pinned GitHub Actions workflow.
- Added the required architecture, security, verdict, policy, setup, and decision documentation.

### Key decisions

- Zod is the single runtime contract; the committed verdict JSON Schema is checked for exact drift in tests.
- The supplied policy fixture’s documentation and generated-file rules remain supported in addition to the abbreviated Phase 0 list.
- Node standard-library path/process APIs replace `env-paths` and `execa` until a later phase proves those dependencies necessary.
- The eight required ADRs share one concise decision record instead of eight boilerplate files.
- pnpm allows the lifecycle script for `esbuild` only; arbitrary dependency build scripts remain denied.

### Files and packages

- `packages/domain`
- `packages/contracts`
- `packages/config`
- `packages/testkit`
- `apps/cli`
- `schemas/verdict.schema.json`
- `gatekeeper.policy.example.yaml`
- `.github/workflows/ci.yml`
- root workspace/tooling configuration and `docs/`

### Commands run

All commands below exited 0 on 2026-07-16:

```text
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @gatekeeper/cli start -- --help
pnpm --filter @gatekeeper/cli start -- doctor --format json
node apps/cli/dist/index.js --version
pnpm format:check
pnpm audit --audit-level high
```

### Tests and results

- 8 test files passed.
- 17 tests passed.
- Verdict fixtures accept valid data and reject unknown fields.
- The committed verdict JSON Schema matches the Zod-generated schema.
- `BLOCK` requires a hard deterministic finding; inference cannot produce it.
- The root policy example validates; invalid policy values return dotted paths.
- Missing optional `gh` returns a warning without crashing or failing Doctor.
- pnpm argument forwarding and empty app-data environment variables have regression coverage.
- No test requires network access.
- Dependency audit reported no known vulnerabilities.

### Manual verification

- Source CLI help and Doctor JSON output run through the exact planned pnpm commands.
- The compiled CLI reports version `0.1.0` and runs Doctor.
- Doctor passed Node, pnpm, Git, and the writable app-data path; absent optional `gh` produced `degraded` with exit code 0 and a repair instruction.

### Security and privacy

- Strict unknown-field rejection applies at serialized contract boundaries.
- Evidence excerpts are capped at 2,000 characters.
- `BLOCK` is deterministic-only.
- Doctor uses an executable plus argument array, with no shell interpolation, auth, or network call.
- Empty platform data-home values fall back to absolute per-user locations rather than repository-relative state.
- CI permissions are read-only and action versions are pinned to immutable SHAs.

### Documentation

- Root README, AGENTS, SECURITY, LICENSE, architecture overview, decision records, security overview, verdict reference, policy reference, development setup, and this progress report are present.

### Git history policy

- Each completed plan step receives one intentional commit after its checks pass.
- Every passing step commit is pushed to `origin/master` so the Build Week implementation remains traceable.
- Red test states, partial steps, and force-pushes are not published.

### Deferred

- Local service, dashboard, Git inspection, deterministic diff review, SQLite Project Memory, MCP/Codex skill, and GitHub history remain in their scheduled phases.
- Vercel React best practices are installed for later dashboard work but are intentionally unused in Phase 0.

### Known limitations

- `gh` is not installed in this development environment; this is optional until the GitHub integration phase.
- Full macOS/Linux product verification and packaging remain scheduled for final hardening.

### Exact next-phase entry condition

Phase 1 may begin only when the user explicitly requests it. It may create `packages/git-adapter`, `apps/server`, and `apps/dashboard`, and must stop before SQLite, MCP, GitHub calls, or model reasoning.

## Phase 0 scope boundary audit at completion

No server, dashboard, MCP server, storage, Git adapter, review engine, diff review, GitHub call, or model call exists.

## Phase 1 completion report

Phase: Local service spine and real dashboard shell

Status: COMPLETE

### Implemented

- Added strict repository snapshot, health, bootstrap, status, tool-availability, and service-metadata contracts.
- Added safe Git root discovery and snapshot inspection through `execa` argument arrays.
- Added the loopback-only Fastify service with bearer authentication, Host and Origin validation, restrictive CSP, strict request and response schemas, bounded Pino logs, and ephemeral machine-local metadata.
- Added the React/Vite dashboard with React Router, TanStack Query, in-memory bootstrap, real repository and environment data, responsive CSS Modules, a locally bundled IBM Plex Sans variable font, a dark graphite product theme, and explicit loading, absent-value, retryable-error, and unknown-route states.
- Added the foreground `gatekeeper start [path]` lifecycle with local tool inspection, built-dashboard serving, signal handling, and orderly cleanup.

### Verification

All commands exited 0 on 2026-07-17:

```text
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
pnpm audit --audit-level high
```

- 14 test files and 51 tests passed.
- The exact source CLI start command served the built dashboard and authenticated status API on `127.0.0.1`.
- Health returned only `status` and `version`; an arbitrary repository-path query was rejected with 400.
- Browser review at desktop and 375-pixel mobile widths found no horizontal overflow, unnamed controls, console warnings, or console errors.
- The desktop layout, responsive navigation, real null/disabled states, keyboard order, visible focus CSS, and reduced-motion behavior were reviewed.
- Ctrl+C stopped the service, made the port unreachable, and removed ephemeral service metadata.
- The dependency audit reported no known vulnerabilities.

### Scope boundary

Phase 1 stops here. No diff review, review engine, SQLite, Project Memory, FTS5, MCP server, Codex skill, GitHub data call, or model reasoning was added. Phase 2 may begin only when the user explicitly requests it.

## Phase 2 completion report

Phase: Deterministic worktree review

Status: COMPLETE

### Implemented

- Added strict ChangeSet and extended ReviewRun v1 contracts with generated, drift-tested JSON Schemas.
- Added bounded staged, unstaged, renamed, deleted, binary, and untracked worktree extraction with layered ignores and canonical path safety.
- Added the pure review engine with metrics and five deterministic checks: size, source/test relationship, risk zone, import boundary, and protected path.
- Added safe repository policy loading from `.gatekeeper/policies.yaml`, including a version-1 default for review and required-file validation mode.
- Added `gatekeeper policy validate` and human/JSON `gatekeeper review worktree` commands with stable review error codes.
- Added idempotent clean, missing-test, and protected-path Git fixtures.
- Added the authenticated `POST /v1/reviews/worktree` endpoint, generated draft-7 response schema, and exact direct dashboard entry route.
- Added the accessible React Review Inspector with ready, pending, retryable-error, empty, and completed states; readable verdict/authority text; metrics; findings; remediation; and bounded change summaries.

### Verification

All commands exited 0 on 2026-07-18:

```text
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
pnpm audit --audit-level high
pnpm fixtures:prepare
```

- 20 test files and 101 tests passed.
- The fixture generator was run twice to confirm idempotence.
- Policy validation passed for the clean fixture.
- Exact compiled CLI review returned `FAST_PATH` for clean, `REQUIRE_CHANGES` for missing-test, and `BLOCK` for protected-path.
- The JSON result validated through `reviewRunSchema`.
- Completed review commands, including `BLOCK`, exited 0 because Phase 2 does not enforce mutations.
- Desktop and 375-pixel live dashboard reviews passed with no page-wide horizontal overflow or console warnings/errors.
- The Impeccable detector reported no generic design-pattern findings.
- The dependency audit reported no known vulnerabilities.

### Security and privacy

- Git commands use executable-plus-argument arrays with bounded output and no shell interpolation.
- Changed paths and policy/ignore files are contained within the canonical repository root.
- Internal added-line inspection is capped; raw source and raw diffs never enter ReviewRun, CLI output, HTTP responses, dashboard state, or logs.
- The changed-path cap is enforced before untracked content reads, disappearing files become stable safe errors, and valid names beginning with two dots are not confused with traversal.
- A truncated configured import-boundary inspection escalates for human review instead of allowing an incomplete `FAST_PATH`.
- The review API accepts only `{}` for the repository fixed at service startup and requires the ephemeral bearer token.
- Every Phase 2 finding is deterministic; only a hard deterministic finding can produce `BLOCK`.
- Default tests require no network, GitHub authentication, or OpenAI key.

### Key decisions

- One `runWorktreeReview` composition serves direct CLI and the injected local API callback.
- Review behavior lives only in `packages/review-engine`; adapters format or transport validated results.
- Native Git owns worktree truth; the `ignore` package supplies Git-compatible Gatekeeper/policy pattern matching.
- Added-line evidence exists only at the Git/review boundary and is stripped from the public result.
- Reviews remain ephemeral until Phase 3; no placeholder storage or generic plugin system was added.

### Traceability

The verified implementation steps were committed and pushed individually:

- `6b48802` execution contract;
- `e510f2a` bounded worktree extraction;
- `dd6b1a9` deterministic review engine;
- `d7d2676` policy loader, CLI, and fixtures;
- `6008345` local review API;
- `531582d` dashboard Review Inspector.

Expected RED states, unexpected failures, corrections, and command evidence are retained in `docs/development/phase-2-execution-log.md`.

### Deliberate limitations

- ReviewRun is not persisted and cannot be searched or compared after process/page lifecycle ends.
- Only worktree review is implemented; staged-only, branch, commit-range, and pull-request targets remain contract vocabulary.
- Documentation relationships, generated-file denial, linked-issue/description requirements, and risk-zone requirement lists are parsed but not evaluated in Phase 2.
- Import boundaries examine bounded added relative-import lines; they are not a language-server or module-resolver replacement.
- `gh` remains optional and no GitHub or model call is made.

### Exact next-phase entry condition

Phase 3 may begin only after an explicit user request. It may create `packages/store-sqlite` and `packages/project-memory`, persist reviews and bounded evidence outside the target repository, add FTS5 retrieval and the scheduled memory CLI/API/dashboard surfaces, and extend Doctor for storage capabilities. It must not start MCP, the Codex skill, GitHub synchronization, pull-request review, or model reasoning early.

## Phase 2 scope boundary audit at completion

No SQLite database, Project Memory, FTS5 index, MCP server, Codex skill, GitHub call, pull-request review, or model call exists. Phase 2 stops at the deterministic ReviewRun v1 gate.

## Phase 3 completion report

Phase: SQLite Project Memory and evidence retrieval

Status: COMPLETE

Completed: 2026-07-18

### Implemented

- Added `packages/store-sqlite` with the focused Drizzle schema, reviewed versioned migration, native better-sqlite3 driver, foreign keys, WAL, FTS5 external-content synchronization, exact-first retrieval, and atomic index/review transactions.
- Added `packages/project-memory` with stable remote-first repository identity, bounded local Git sources, incremental indexing, path-scoped invalidation, repository-isolated search, and explicit untrusted-content labels.
- Indexed tracked metadata/hashes, selected Markdown and ADRs, bounded policy content, and up to 200 bounded recent commits while denying known secret names, ignore matches, symlinks, oversized content, and invalid UTF-8.
- Persisted strict ReviewRun records, findings, evidence pointers, and `previousReviewId`; worktree reviews now survive process restarts.
- Added Doctor storage checks plus `repo init`, `repo status`, `index`, `memory search`, and `review show` CLI commands.
- Added fixed-repository registration, index, memory-status/search, persisted-review, and review-persistence APIs with strict shared contracts.
- Added the dark Project Memory dashboard search and persistent review routes with explicit initial, pending, empty, error, not-found, and success states.

### Verification

All commands exited 0 on 2026-07-18:

```text
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
pnpm audit --audit-level high
pnpm fixtures:prepare
```

- 27 test files and 156 tests passed; two shuffled full-suite seeds passed the same matrix.
- Fresh compiled CLI acceptance wrote six documents on the first index and zero files, documents, or commits on the unchanged second index.
- Redis search returned ADR, commit, and documentation evidence, all labelled `untrusted_repository_content`.
- A compiled `FAST_PATH` worktree review reopened from Project Memory in a separate CLI process.
- Complete service shutdown/restart tests returned the same persisted review and linked the next run through `previousReviewId`.
- Live dashboard inspection at 1440×900 and 375-pixel widths exercised memory search and review-to-reopen without page-wide horizontal overflow.
- The dependency audit reported no known vulnerabilities.

### Aggressive findings and corrections

- Interrupted migrations, failed index/review transactions, corrupt review JSON, hostile FTS syntax, invalid storage parents, secret denial, repository isolation, restart persistence, and bounded logging were exercised.
- A forged cross-repository document-ID collision could alter the original document while the second repository reported a write. The SQLite upsert now enforces repository ownership and rolls back the entire batch.
- A forged cross-repository review-ID collision could transfer a review. The review upsert now enforces the same ownership invariant and preserves the original run.
- Ponytail's complete phase-diff review found no removable dependency, speculative worker, cache, generic repository layer, or plugin mechanism. The implementation remains limited to canonical Phase 3 behavior.

### Security and privacy

- The database resolves under per-user machine app data and outside target repositories by default.
- Repository-derived content is always bounded, repository-scoped, parameterized at the SQL boundary, labelled untrusted, and rendered as plain text.
- Raw source, raw diffs, ignored/denied secrets, bearer tokens, and database details do not enter persisted evidence, API errors, or logs.
- Document and review identities are repository-owned; collision failures are atomic and fail closed.
- Default tests require no network, GitHub authentication, or OpenAI key.

### Traceability

The verified implementation steps were committed and pushed individually:

- `dc5dd03` Phase 3 execution contract;
- `4d19aad` SQLite storage and migrations;
- `c41a79c` bounded Git memory sources;
- `a9c3077` incremental indexing and retrieval;
- `f07210a` Doctor, CLI, fixture, and review persistence;
- `762a514` persistent local API;
- `262a308` dashboard memory and stored-review routes;
- `0967e6b` repository-owned storage hardening.

Expected RED states, unexpected failures, corrections, and command evidence are retained in `docs/development/phase-3-execution-log.md`.

### Deliberate limitations

- Only local worktree review and local Git/document history exist; no pull-request target or GitHub synchronization exists.
- Search is exact plus FTS5; there are no embeddings, semantic reranking, model-generated findings, or general relationship extraction.
- `document_links` is the plan-mandated schema slot but remains empty until scheduled explicit relationship extraction exists.
- The service remains one foreground process for one fixed repository; there is no daemon, worker queue, hosted backend, or multi-repository administration UI.

### Exact next-phase entry condition

Phase 4 may begin only after an explicit user request. It may create the stdio MCP server, trusted-project Codex configuration, repository Gatekeeper skill, six local tools, and the strict Codex completion handshake. The seventh final tool, `gatekeeper_review_pull_request`, belongs to Phase 5 after its real GitHub-backed review path exists. Phase 4 must stop before GitHub synchronization, pull-request review, publication, or a second model provider.

## Phase 3 scope boundary audit at completion

No MCP server, Codex skill, GitHub network call, pull-request review, embedding, model-generated finding, background worker, publication path, or generic plugin system exists. Phase 3 stops at durable local Project Memory and evidence retrieval.

## Phase 4 — Native Codex workflow through skill and MCP

Status: complete on 2026-07-18.

### Implemented

- Corrected the phase contract so Phase 4 owns six fully local tools and Phase 5 adds `gatekeeper_review_pull_request` only after a real GitHub-backed review path exists.
- Added strict ReviewDraft and completion contracts. Codex can author only `EVIDENCE_SUPPORTED` or `INFERENCE` findings and cannot submit a verdict, deterministic authority, enforcement, or policy identity.
- Added bounded review preparation, Project Memory evidence retrieval, deterministic prompt-injection detection, exact evidence/path validation, immutable deterministic findings, Gatekeeper-owned verdict assembly, and accurate mixed-authority summaries.
- Added authenticated draft and completion endpoints to the existing foreground service. Completed runs replace the same local review atomically and survive restart through the existing dashboard/read path.
- Added `apps/mcp-server` with pinned official MCP SDK v1.29.0, stdio only, protocol-clean stdout, validated machine-local service metadata, native fetch, bounded timeouts, and strict response validation.
- Exposed exactly six tools: `gatekeeper_status`, `gatekeeper_index_repository`, `gatekeeper_review_worktree`, `gatekeeper_search_memory`, `gatekeeper_complete_review`, and `gatekeeper_get_review`.
- Added trusted-project `.codex/config.toml` and the `.agents/skills/gatekeeper` skill with consent, trust, evidence, verdict, and no-unrequested-remediation rules.
- `gatekeeper_status` now returns current and indexed HEAD state so the skill can distinguish uninitialized, stale, and current memory without a speculative seventh tool.

### Aggressive findings and corrections

- The original Phase 4 wording contradicted its stop gate by requiring a pull-request tool before Phase 5. The plan now prevents a placeholder implementation.
- Model-authored verdicts, deterministic authority, enforcement, policy identity, duplicate IDs, forged/cross-repository pointers, and unchanged affected paths are rejected.
- Instruction-like evidence split across lines is still detected, remains inert data, and creates a deterministic content-security escalation.
- MCP status rejects a response assembled across two different fixed repositories during a service-restart race.
- Malformed service metadata never reaches fetch; missing service, invalid response, and timeout errors are bounded and contain an exact repair command.
- Identical review completion replay is stable. Restart tests prove the completed ReviewRun remains durable.
- A real built service and built stdio MCP process completed all six tool calls, persisted a `FAST_PATH` review, and loaded the identical record.
- Ponytail's phase-diff review found no removable dependency, provider abstraction, transport layer, tool registry, worker, retry framework, or Phase 5 placeholder. The one new external runtime dependency is the required official MCP SDK.

### Verification

- `pnpm install --frozen-lockfile`: PASS.
- `pnpm audit --audit-level high`: PASS; no known vulnerabilities.
- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- `pnpm test`: PASS (32 files, 183 tests), including shuffled order.
- `pnpm build`: PASS.
- Official MCP SDK in-memory discovery and real stdio discovery: PASS; exact six-tool set.
- Skill Creator `quick_validate.py`: PASS.
- Official Codex CLI 0.144.6 `mcp list`: PASS; `gatekeeper` is enabled with the configured command, argument, and working directory.

The desktop application's protected WindowsApps `codex.exe` cannot be launched from this PowerShell host (`Access is denied`), so CLI acceptance used the same official package through temporary `npx` execution. No project dependency or global install was added.

### Traceability

- `b2b931e` — align Phase 4 and Phase 5 MCP scope;
- `9ff5bf8` — enforce Codex completion boundaries;
- `c74094c` — persist strict Codex review completion;
- `dacaf2f` — expose six local Gatekeeper tools;
- `e7b9141` — add trusted Gatekeeper workflow.

Expected RED states, unexpected failures, corrections, live acceptance, and environment limitations are retained in `docs/development/phase-4-execution-log.md`.

### Deliberate limitations and exact next-phase entry condition

- The MCP surface is local worktree only; there is no GitHub synchronization, pull-request target, remote publication, second provider, embedding, background job, arbitrary file/process access, or generic plugin system.
- Prompt-injection detection is a bounded deterministic warning layer, not a claim to recognize every possible adversarial encoding. The primary control remains treating all repository content as untrusted data.
- Phase 5 may begin only after an explicit user request. It may add the read-only `gh` adapter, bounded incremental GitHub history, the Ghost Change fixture, pull-request CLI/API/dashboard review, and `gatekeeper_review_pull_request` as the seventh tool. It must not publish to GitHub or start Phase 6 dashboard work early.

## Phase 5 — Read-only GitHub history and the Ghost Change

Status: complete on 2026-07-18.

### Implemented

- Added a strict GitHub.com provider using only authenticated status, pull-request view, and explicit GET API calls with argument arrays, disabled shell/stdin, bounded time/output, typed schemas, safe errors, partial malformed-record survival, and no token storage.
- Added incremental remote Project Memory for issues, pull requests, comments, reviews, ordered explicit relationships, remote evidence URLs, partial-sync cursor retention, stale-replay protection, atomic duplicate rejection, and exact/linked/FTS ranking.
- Added deterministic pull-request review, GitHub checks and inert prompt-injection findings, persisted previous-review linkage, `sync github` and `review pr` CLI commands, fixed-repository Fastify operations, and bounded environment repair responses.
- Added `gatekeeper_review_pull_request` as the seventh strict MCP tool and updated the repository Gatekeeper skill for explicit sync/model consent, untrusted GitHub evidence, local completion, and no publication.
- Added one focused OpenAI-inspired dark dashboard PR route with explicit sync/review, partial/error/pending states, persisted target display, and safe exact-GitHub evidence links.
- Added the reproducible network-free Ghost Change: raw provider responses, passing checks, proposal/implementation/regression/revert/ADR links, lexical noise, hostile PR prose, completion, SQLite restart, dashboard/API/MCP integration, and `ESCALATE`-never-`BLOCK` assertions.
- Added a separate dry-run-first, marker-idempotent metadata seeder. Its apply executor requires exact target approval plus prepared branches and can create/close only its marked demo objects; it cannot merge, delete, reset, or touch unrelated content.

### Aggressive findings and corrections

- Fixed malformed issue query construction, stale cursor/document replay, partial cursor advancement, remote drift before persistence, duplicate prompt-injection finding IDs during completion, a five-result cap that truncated the six-node evidence chain, broad demo test discovery, workspace-only `tsx` resolution, seeder partial-write hazards, lookalike object URLs, and arbitrary-host remote normalization.
- Missing `gh`, failed authentication, invalid JSON, oversized output, shell metacharacters, credential/path/query remote attacks, excessive PR files, malformed history, duplicate batch identities, forged/cross-repository evidence, completion replay, hostile Markdown/URLs, submitted verdicts, and inference attempting `BLOCK` fail safely in focused tests.
- The production adapter has no GitHub write command. The optional seeder is isolated, makes zero requests by default, and was never applied.
- Gatekeeper completed and persisted its own local review without changing files or publishing. Ponytail found the phase diff lean and within the hackathon boundary.

### Verification

- `pnpm install --frozen-lockfile`: PASS.
- `pnpm audit --audit-level high`: PASS; no known vulnerabilities.
- `pnpm fixtures:prepare`: PASS twice; four deterministic repositories each run.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, formatting, diff checks, shuffled tests, fixture/CLI smoke, official MCP SDK discovery, real stdio discovery, and Gatekeeper skill validation: PASS.
- Default verification remained network-, GitHub-auth-, and model-key-free.

### Traceability

- `9ee72ab` — define the corrected Phase 5 contract;
- `689426c` — add the read-only GitHub provider;
- `e39e1a7` — persist linked GitHub history;
- `e6be0d4` — review GitHub pull requests locally;
- `1b40a45` — expose the fixed GitHub review API;
- `d3ae9a7` — add pull-request MCP review;
- `32f5fd5` — add the dashboard pull-request route;
- `9e18e08` — add the offline Ghost Change scenario;
- `821cbff` — complete the Ghost Change workflow and isolated seeder.

Detailed RED/GREEN evidence, failures, corrections, and environment limits are retained in `docs/development/phase-5-execution-log.md`.

### Deliberate limitations and exact next-phase entry condition

- Live GitHub reads require an installed, authenticated `gh` and an existing approved repository. GitHub Enterprise routing, publication, Actions, comments, checks, labels, merges, hosted services, and permanent maintainer decisions remain absent.
- Phase 6 may begin only after an explicit user request. It may build the dashboard hero experience, real review-progress polling, ordered EvidenceTimeline, remediation prompts/panel, and before/after review comparison. It must stop before settings, policy editing, collaboration, analytics, accounts, remote hosting, or decorative charts.

## Phase 6 — Dashboard hero experience and remediation loop

Status: complete on 2026-07-19.

### Implemented

- Added strict persisted review operations with queued, running, failed, and completed states; bounded real stages; atomic ReviewRun completion; restart interruption recovery; and deep links that survive process restarts.
- Added dashboard-only asynchronous worktree and pull-request start routes while preserving the synchronous CLI/MCP/API review paths.
- Added relationship-aware Project Memory results and an ordered evidence timeline with proposal, implementation, incident, revert, decision, revived-change, and bounded context roles.
- Completed operations now compose the immutable current review, matching previous review, nullable bounded GitHub sync status, and up to fifty safe evidence items without moving verdict ownership out of the review engine.
- Rebuilt the Review Inspector around real polling, explicit partial/offline/failure states, plain-text findings and excerpts, validated GitHub/internal links, grouped remediation, local clipboard prompts, re-review, and stable finding/evidence comparison.
- Preserved the OpenAI/Codex-inspired graphite system, IBM Plex Sans, semantic color, keyboard navigation, visible focus, reduced motion, and responsive laptop composition without adding a component library, chart, animation package, or hosted surface.
- Added one deterministic Playwright Chromium proof using the real service, temporary Git repository, SQLite Project Memory, exported Ghost provider, and built dashboard.

### Verification

All final commands exited 0 on 2026-07-19:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm playwright test
pnpm format:check
pnpm audit --audit-level high
git diff --check
```

- 41 Vitest files and 253 tests passed; the Playwright Ghost Change acceptance passed separately in Chromium.
- The real browser observed invalid PR containment, durable progress, `ESCALATE`, six ordered history nodes, partial-history disclosure, clipboard remediation, service restart, `FAST_PATH`, and an immutable before/after comparison.
- Full-page escalation and comparison captures at 1440x900, 1280x720, and 1024x768 were individually inspected with no document overflow or broken hierarchy.
- The fresh Web Interface Guidelines audit and Impeccable detector had no remaining applicable findings; the high-severity dependency audit found no known vulnerabilities.

### Aggressive findings and corrections

- The first browser fixture omitted repository indexing and truthfully produced only five timeline nodes. It now indexes the temporary repository through the authenticated API so the active ADR earns the sixth decision node.
- Persisted operation ownership, corrupt JSON, interrupted restart, callback failure, malformed contracts, unsafe links, hostile HTML/script prose, long evidence, offline states, partial sync, and clipboard failure are covered across storage, server, contract, component, and browser boundaries.
- The dashboard no longer duplicates GitHub synchronization: one start request owns synchronization and review, and the completed operation carries its bounded partial-sync result.
- Ponytail removed a redundant overflow assertion and found no removable production abstraction or dependency beyond the required browser test package.

### Security and privacy

- Repository and GitHub prose remains labelled untrusted and is rendered as text. The dashboard receives bounded evidence pointers and change summaries, never raw source, raw diffs, tokens, private exceptions, or shell output.
- GitHub links are credential-free validated `https://github.com` URLs; unsafe links fall back to internal Project Memory search.
- Review progress and comparisons are derived from persisted local contracts. Prompt controls copy bounded text locally and never call Codex, a model, or an external service.
- Model inference still cannot produce `BLOCK`; deterministic policy remains the only hard-block authority.

### Traceability

- `ac12642` — define Phase 6 dashboard execution;
- `dbc6c01` — persist review operation progress;
- `bc75b70` — expose pollable review progress;
- `b106db9` — expose the review evidence timeline;
- `6d85fa9` — complete the dashboard remediation loop;
- the Phase 6 completion commit adds the real-browser proof and closes the documentation gate.

Detailed RED/GREEN states, browser failures, corrections, audits, and visual evidence are retained in `docs/development/phase-6-execution-log.md`.

### Deliberate limitations and exact next-phase entry condition

- Gatekeeper remains one local foreground process for one fixed repository. It has no worker, hosted backend, collaboration, accounts, analytics, settings, policy editor, permanent maintainer decision write, decorative charts, or GitHub publication path.
- In-process operations interrupted by shutdown become bounded failures rather than resuming automatically. Playwright Chromium is a local release gate and is not yet part of CI.
- Phase 7 may begin only after an explicit user request. It may package the reproducible demo, harden cross-platform delivery, prepare submission evidence, and perform the final hackathon audit. It must not broaden Gatekeeper into a hosted multi-user product or add deferred product surfaces.

## Phase 6 scope boundary audit at completion

No hosted service, background worker, queue, SSE stream, account system, collaboration layer, analytics surface, settings/policy editor, chart package, GitHub write path, or second model provider exists. Phase 6 stops at the verified local remediation loop.

## Phase 7 — Release hardening, judge demo, evals, and submission

Status: COMPLETE on 2026-07-19.

Phase 7 is limited to security regression hardening, deterministic release controls, network-free judge demonstration/evaluation, clean-install/uninstall evidence, release documentation, video/Devpost preparation, and final code freeze. It must not add new product behavior except a release-blocking security or reproducibility control discovered by verification.

### Completion evidence

- Deterministic-only startup, model-data dry run, the disposable fixture-only judge service, six-outcome golden evaluation, and the checked-in report are implemented and committed as Phase 7 release controls.
- A fresh detached Windows checkout passed frozen-lockfile install, build, and the judge smoke matrix. The final Windows release matrix passed frozen-lockfile install, lint, typecheck, 47-file/262-test suite, production build, Chromium acceptance, fixture generation, judge smoke, evaluation regeneration, model-data dry run, formatting, high-severity dependency audit, and diff check.
- The targeted 84-check attack suite covers prompt injection, path/symlink containment, Git argument arrays, secret denial/redaction, poisoned remote content, Host/Origin and token protection, stale data boundaries, deterministic `BLOCK` authority, and deterministic-only refusal. A post-freeze direct process audit then found unbounded release-helper and local-probe subprocesses; all four affected paths now have the existing 30-second limit, with focused regression coverage and a successful fixture/judge rerun. A subsequent quick-start correction now runs the built CLI from the workspace root so documented fixture paths resolve as shown.
- Ponytail found no redundant Phase 7 dependency, evaluator framework, launcher layer, or post-hackathon surface. The codebase is re-frozen after the documented post-freeze correction.

### Remaining user-authorized submission steps

- No video was uploaded, repository access was shared, feedback session identifier was transmitted, Devpost project was created/finalized, or submission was made. The prepared checklist and draft copy retain those actions for explicit user authorization only.

### Code-freeze boundary

All planned hackathon phases are complete. The one post-freeze release-blocking process-safety correction is complete. Only future release-blocking bug fixes, documentation corrections, approved video edits, and user-authorized submission validation may follow; no new product feature should begin.

## User-authorized post-freeze extension — historical commit review

Status: COMPLETE on 2026-07-19.

The user explicitly authorized one bounded extension after code freeze: review one immutable historical commit through the existing deterministic pipeline and show the ten newest indexed commits beneath the Memory evidence query. It remains a single fixed-repository local service. Project selection, commit browsing, pagination, GitHub writes, model verdicts, database migrations, and new dependencies remain out of scope.

The authoritative execution checklist is `docs/superpowers/plans/2026-07-19-historical-commit-review.md`; RED/GREEN evidence and corrections are recorded in `docs/development/historical-commit-review-execution-log.md`.

- Commits: `c0d3b9e`, `95a6e86`, `8d59520`, `c6d1ee5`, `7500120`, `90ede0e`, and the documentation completion commit.
- Full completion matrix: frozen-lockfile install; lint; typecheck; 49-file/283-test suite; build; two Playwright Chromium stories; demo smoke; evaluation; model-data dry run with zero model calls; formatting; high-severity audit; and diff check all pass on 2026-07-19.
- The real twelve-commit browser acceptance proves ten-row bounded history, search replacement, clear restoration, deterministic first-parent `REQUIRE_CHANGES`, restart-safe deep link/re-review comparison, and unchanged target repository state.
- Code freeze is re-established. Future work is limited to release-blocking fixes, documentation corrections, approved video edits, and user-authorized submission validation; no deferred product surface may start without explicit authorization.

## User-authorized post-freeze extension — foundation hardening

Status: COMPLETE on 2026-07-19.

The user authorized a focused hardening pass after the historical-commit extension. It closes the audited failure modes without broadening Gatekeeper beyond one foreground fixed-repository service:

- A machine-local owner lock prevents a second service from replacing metadata or failing another service's review; a stale absent-process lock is reclaimed safely.
- Project Memory now fails closed if a fixed checkout's normalized remote changes, and status reports the live repository snapshot rather than a startup-time head.
- Dashboard review operations admit one active run. Terminal failure remains observable when its last SQLite write fails; orderly shutdown prevents resumed old tasks from writing afterward.
- Doctor detects malformed review-operation state. The explicit `doctor --repair` action creates a local SQLite-consistent backup, then deletes only malformed operation records; it never touches target repositories or valid review runs.
- Migration `0003_review_target_key` stores a private full target key. Historical commit comparison uses the complete SHA, so an abbreviated display-prefix collision cannot create a false `previousReviewId` link.

RED/GREEN evidence, repair behavior, Git-state assertions, and the final release matrix are recorded in `docs/development/foundation-hardening-execution-log.md`. The verified passing commits are `ac3d6ed`, `2a4e2e9`, `4db277c`, `74413ae`, and the completion commit for this task.

The complete matrix passed frozen install, lint, typecheck, 49-file/297-test suite, build, two Chromium stories, demo smoke, evaluation, zero-call model-data dry run, formatting, high-severity audit, strict Git object audit, and diff check. Code freeze is re-established: future work is limited to release-blocking fixes, documentation corrections, approved video edits, and user-authorized submission validation.

## User-authorized post-freeze CI portability correction

Status: local verification complete on 2026-07-19; GitHub Actions confirmation is tracked in issue #1.

- GitHub Actions CI #59 exposed that the server-test fixture used a Windows-only repository root. The fixed-repository safety check correctly rejected that nonexistent path on Ubuntu before a review began, which cascaded into server lifecycle test failures.
- The fixture now uses `process.cwd()` so the service tests exercise the actual checked-out repository on Windows and Linux. No production service behavior, dependency, product scope, or target repository behavior changed.
- A deliberate inaccessible-root RED control reproduced 9 failed server tests locally. After the correction, the focused suite passed 42 tests and the full quality gate passed: lint, typecheck, 49 files / 297 tests, and build.
- Detailed root-cause evidence is retained in `docs/development/foundation-hardening-execution-log.md`; GitHub issue #1 owns the external CI result and closure evidence.

## User-authorized post-freeze extension — local Commit Explorer

Status: COMPLETE on 2026-07-19.

The user explicitly authorized a bounded local Commit Explorer after code freeze. It adds `/commits` without changing the one-fixed-repository service model, Memory evidence search, CLI, MCP tools, or GitHub behavior.

- The strict authenticated local API resolves `master` when present (otherwise the checked-out local branch), lists current local branches, returns at most 24 metadata cards, and joins only the existing indexed/reviewed facts from Project Memory.
- The dashboard adds native branch/source/query/date/review-state/order filters, next/previous cursor navigation, loading/empty/stale-branch/error recovery, and compact graphite commit cards that start the existing immutable full-SHA review operation.
- Git remains the only authority for branch membership and history. The extension has no migration, dependency, GitHub request, model call, target-repository mutation, repository picker, commit body/diff exposure, author filter, total-history count, or browser-persisted selection/token.
- The existing Memory evidence search and its ten-row indexed-history grid remain unchanged.
- Final release matrix passed: `pnpm lint`, `pnpm typecheck`, isolated-temp `pnpm test` (51 files / 313 tests), `pnpm build`, `pnpm format:check`, `pnpm audit --audit-level high`, and `git diff --check`.

The authoritative checklist is `docs/superpowers/plans/2026-07-19-commit-explorer.md`; RED/GREEN evidence, corrections, and environmental limits are retained in `docs/development/commit-explorer-execution-log.md`.

Verified implementation commits: `e27e5f5`, `6a66650`, `f39097c`, `b67c3c5`, and `c0656e3`; this documentation commit closes the extension record.
