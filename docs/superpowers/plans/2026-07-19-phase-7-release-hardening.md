# Phase 7 Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Work directly on `master` because the user explicitly authorized direct commits and pushes. Each passing task is an intentional commit pushed to `origin/master`; no red state is pushed.

**Goal:** Make the completed local Gatekeeper product secure, reproducible for judges, evidenced by deterministic evals, and ready for user-authorized video and Devpost submission.

**Architecture:** Preserve the completed Phase 0–6 contracts and adapters. Phase 7 adds only release controls around them: a service-enforced deterministic-only switch, a dry-run disclosure of the bounded data Codex could receive, a local Ghost Change judge launcher and smoke test, and documentation/evidence artifacts. It does not add a hosted service, GitHub publication, a second model, a worker, or any dashboard feature.

**Tech Stack:** Existing Node.js 24, TypeScript strict ESM, Commander, Fastify, Zod, SQLite, Vitest, Playwright Chromium, and the deterministic Ghost Change fixture. No new runtime dependency is allowed.

## Global constraints

- Execute only canonical hackathon Phase 7; the long-term optional GitHub Action/plugin distribution remains deferred.
- Use test-first development for every behavior change and Ponytail at full intensity.
- Keep the default test matrix network-, GitHub-auth-, and OpenAI-key-free.
- Preserve read-only GitHub behavior; never publish comments, checks, labels, branches, merges, or repository changes.
- Repository, GitHub, model-facing, and log data remain bounded untrusted data. Never log source, diffs, headers, bearer tokens, or private exception text.
- `BLOCK` remains available only to a deterministic hard-policy finding. Model inference cannot create it.
- Video upload, repository sharing, feedback submission, and Devpost submission require explicit user approval and are prepared rather than performed.
- Run the root quality gate, `pnpm playwright test`, `pnpm demo:smoke`, `pnpm audit --audit-level high`, formatting, and diff checks before the final completion commit.

---

### Task 1: Freeze the release scope and threat model

**Files:**

- Create: `docs/release/phase-7-threat-model.md`
- Create: `docs/release/submission-checklist.md`
- Create: `docs/development/phase-7-execution-log.md`
- Modify: `docs/progress.md`

**Interfaces:**

- Consumes: existing Phase 0–6 security controls and the canonical Phase 7 checklist.
- Produces: one traceable release register that distinguishes verified internal work from user-authorized external actions.

- [ ] Write the failing documentation assertions in `docs/development/phase-7-execution-log.md`: the threat model must name every implemented trust boundary; the submission checklist must reserve, not perform, video, Devpost, repository-sharing, and feedback actions.
- [ ] Confirm the expected RED state with `rg -n "Phase 7|Devpost|threat model" docs/release docs/development/phase-7-execution-log.md`; expected result is missing files.
- [ ] Add the smallest threat-model table mapping trust boundary, implemented control, regression evidence, and remaining limitation. Add a submission checklist whose external steps state `Requires user authorization` and never contain credentials or a real session identifier.
- [ ] Run `pnpm exec prettier --check docs/release/phase-7-threat-model.md docs/release/submission-checklist.md docs/development/phase-7-execution-log.md docs/progress.md` and `git diff --check`.
- [ ] Commit `docs: define phase 7 release hardening` and push `master`.

### Task 2: Enforce deterministic-only operation and expose model-data dry run

**Files:**

- Modify: `apps/cli/src/index.ts`
- Modify: `apps/cli/src/start.ts`
- Modify: `apps/cli/src/start.test.ts`
- Modify: `apps/server/src/server.ts`
- Modify: `apps/server/src/server.test.ts`
- Modify: `apps/server/src/service.ts`
- Create: `demo/model-data-dry-run.ts`
- Create: `demo/model-data-dry-run.test.ts`
- Modify: `package.json`
- Modify: `docs/reference/cli.md`
- Modify: `docs/reference/local-api.md`

**Interfaces:**

- Consumes: existing start lifecycle, authenticated review-completion route, `ReviewDraft`, and Ghost fixture.
- Produces: `gatekeeper start --deterministic-only`, which rejects model-completion requests with the existing bounded `FORBIDDEN` envelope, plus `pnpm model-data:dry-run`, which emits a local report with zero model transport/calls and pointers/counts only—never excerpts.

- [ ] Add a focused failing server test asserting the deterministic-only completion route returns `403` and does not invoke the completion callback; add a start-command test asserting the CLI forwards `deterministicOnly: true`.
- [ ] Run `pnpm vitest run --config vitest.workspace.ts apps/server/src/server.test.ts apps/cli/src/start.test.ts`; expected result is RED because the option and enforced route guard do not exist.
- [ ] Add the minimum optional boolean to the service/server start seam. Default behavior stays compatible; deterministic-only rejects only completion, not deterministic review, persisted reads, index, or the dashboard.
- [ ] Add a focused failing dry-run test that exercises the production Ghost provider and `prepareReviewDraft`, then requires `modelCalls: 0`, `transport: "none"`, untrusted pointer metadata, and no excerpt/body field in the serialized report.
- [ ] Implement one demo-local report builder and script. It may use fixture data and temporary SQLite only; it must make no network/model request and must close/remove its temporary state.
- [ ] Run focused tests, `pnpm model-data:dry-run`, typecheck, and formatting. Document the exact refusal and report semantics.
- [ ] Commit `feat: add deterministic release controls` and push `master`.

### Task 3: Add the one-command local judge path and golden evaluation

**Files:**

- Create: `demo/judge-demo.ts`
- Create: `demo/judge-demo.test.ts`
- Create: `demo/evaluate.ts`
- Create: `demo/evaluate.test.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/development/demo-seeding.md`
- Create: `docs/release/golden-evaluation.md`

**Interfaces:**

- Consumes: prepared local fixtures, the exported Ghost provider, real service composition, and the existing CLI/engine.
- Produces: `pnpm demo` for the foreground local judge workspace and `pnpm demo:smoke` for a finite, network-free proof of all golden verdict scenarios; `pnpm eval` regenerates the checked-in outcome report from the same fixtures.

- [ ] Write failing judge-demo tests proving the script recreates only its fixed disposable fixture root, starts the real local service with the fixture GitHub provider, emits a loopback dashboard URL, and never calls a live `gh` executable or model endpoint.
- [ ] Confirm RED with `pnpm vitest run --config vitest.workspace.ts demo/judge-demo.test.ts`; expected result is missing module.
- [ ] Implement the smallest local launcher: use one temporary directory and existing fixture/provider composition; do not add a production demo server, browser-opening dependency, queue, or second dashboard.
- [ ] Write a failing evaluation test requiring exact outcomes for clean bug fix (`FAST_PATH`), missing test (`REQUIRE_CHANGES`), protected path (`BLOCK`), auth escalation (`ESCALATE`), Redis revival (`ESCALATE`), and prompt injection (`ESCALATE`), each with no network.
- [ ] Implement the finite evaluator by reusing existing fixture/review functions; generate a concise Markdown report from returned verdicts and stable evidence IDs. Do not invent scores or call a model.
- [ ] Run `pnpm demo:smoke`, `pnpm eval`, focused tests, and inspect the generated report. Document the one-command judge path and its no-credential guarantee.
- [ ] Commit `feat: add reproducible judge demo and evals` and push `master`.

### Task 4: Finish release documentation and uninstall/clean-install evidence

**Files:**

- Create: `docs/release/clean-install-uninstall.md`
- Create: `docs/release/demo-video-script.md`
- Create: `docs/release/devpost-project.md`
- Create: `THIRD_PARTY_NOTICES.md`
- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: `docs/security/overview.md`
- Modify: `docs/progress.md`

**Interfaces:**

- Consumes: actual commands and results from Tasks 2–3.
- Produces: judge-facing installation, demo, privacy, platform, prior-work, Codex/GPT-5.6 disclosure, clean-install/uninstall evidence, video narration, and Devpost copy with no external publication.

- [ ] Write a failing documentation scan that requires each canonical README topic and rejects unqualified claims that the private repo/video/Devpost was already published.
- [ ] Confirm RED with `rg -n "Judge test|Supported platforms|Prior work|GPT-5.6|Devpost" README.md docs/release`; expected result is missing required headings.
- [ ] Add concise judge instructions, verified Windows status, honest macOS/Linux limitation, exactly scoped uninstall evidence (Gatekeeper has no packaged installer; removing its local app-data does not touch target repositories), and third-party notices generated from committed package metadata.
- [ ] Add a three-minute narration script and Devpost draft copy with `Requires user authorization` markers for upload, repository access sharing, feedback session ID, category selection, and final submission.
- [ ] Run a clean temporary dependency install with `pnpm install --frozen-lockfile`, then verify the documented judge smoke path. Record commands/results without machine-specific private paths.
- [ ] Run `pnpm format:check` and `git diff --check`.
- [ ] Commit `docs: prepare phase 7 release evidence` and push `master`.

### Task 5: Attack the release candidate, freeze, and hand off

**Files:**

- Modify: `docs/development/phase-7-execution-log.md`
- Modify: `docs/progress.md`
- Modify: `README.md`

**Interfaces:**

- Consumes: all Phase 7 scripts, tests, reports, and documentation.
- Produces: exact final verification evidence, unresolved external-action checklist, Phase 7 completion report, and code-freeze boundary.

- [ ] Exercise the canonical attack matrix through focused existing/new tests: prompt injection, unsafe paths, outside symlinks, argument-array subprocess handling, secret-file denial/redaction, poisoned remote records, Host/Origin/DNS rebinding, token non-leakage, stale metadata, completion attempting `BLOCK`, and deterministic-only refusal.
- [ ] Run `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm playwright test`, `pnpm demo:smoke`, `pnpm eval`, `pnpm model-data:dry-run`, `pnpm format:check`, `pnpm audit --audit-level high`, and `git diff --check`.
- [ ] Run Ponytail on the complete Phase 7 diff and remove any redundant runtime dependency, launcher layer, evaluator abstraction, or speculative post-hackathon surface.
- [ ] Record every RED/GREEN result, correction, attack outcome, screenshot/video limitation, clean-install result, security conclusion, traceability, and exact external steps still requiring the user's authorization.
- [ ] Commit `docs: complete phase 7 release hardening`, push `master`, confirm local and remote `master` agree, and stop at code freeze.

## Self-review

- Spec coverage: Tasks 1–5 cover every internal Phase 7 build, verification, and final-acceptance item. Video publishing, private repository sharing, feedback capture, and Devpost submission are intentionally prepared but not performed because they need external user authority.
- Scope boundary: no GitHub Action, publication control, hosted service, account, plugin marketplace, packaging distribution, or long-term Phase 8 artifact is introduced.
- Ponytail audit: one optional service flag, one route guard, two finite demo scripts, and Markdown evidence; no new runtime package, worker, queue, browser automation layer, or generic evaluator framework.
