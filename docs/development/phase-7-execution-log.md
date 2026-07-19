# Phase 7 execution log

## Scope

Phase 7 hardens and proves the completed local Gatekeeper product for judges. It adds release controls, a no-credential demo/evaluation path, and submission-ready documentation. It does not add a hosted service, GitHub publication, a GitHub Action, accounts, analytics, a second model provider, package marketplace distribution, or post-hackathon product features.

## Baseline

- Starting branch: `master` aligned with `origin/master`.
- Starting commit: `515b139ae45a1a0144e4bec82f658dcb29fe5ed1`.
- Starting tracked worktree: clean.

## TDD evidence

Expected RED states, GREEN results, unexpected failures, and corrections are appended per verified task. Red states are never committed or pushed.

### Release scope and threat model

- RED: the release threat model, submission checklist, and Phase 7 execution log were absent; the required documentation scan returned missing paths.
- GREEN: the threat model now maps every implemented trust boundary to controls and regression evidence, while the submission checklist explicitly reserves feedback, video, repository-sharing, Devpost creation, and submission for user authorization.

### Deterministic release controls

- RED: deterministic-only completion returned `200` and invoked the completion callback; the CLI did not forward the requested mode; the model-data report module did not exist.
- GREEN: `gatekeeper start --deterministic-only` forwards one optional boolean through the start/service seam and the authenticated completion endpoint returns the existing bounded `403 FORBIDDEN` envelope before parsing or invoking a completion callback. Direct-server and live-service tests prove deterministic review remains available while completion is refused.
- GREEN: `pnpm model-data:dry-run` runs the fixture-backed production provider, Project Memory, and review-draft path in a disposable SQLite database, then prints only source IDs/types/paths and counts with `modelCalls: 0` and `transport: "none"`.
- Correction: the first root-level `tsx` invocation could not resolve workspace package aliases. The existing runnable demo pattern uses relative source entrypoints, so the report now follows that pattern; its root script succeeds without adding a package or dependency.

### Judge demo and golden evaluation

- RED: the judge launcher and evaluator modules were absent, so their focused tests failed at module import.
- GREEN: `pnpm demo` starts the real loopback service on a disposable local Git repository with only the committed Ghost fixture transport and deterministic-only completion refusal. It prints one dashboard URL and removes only that owned temporary root on shutdown.
- GREEN: `pnpm demo:smoke` proves clean bug fix `FAST_PATH`, missing test `REQUIRE_CHANGES`, protected path `BLOCK`, authentication risk `ESCALATE`, Redis revival `ESCALATE`, and prompt injection `ESCALATE`. `pnpm eval` regenerates the stable-ID report with zero external network and model calls.
- Correction: direct server composition needed the existing TypeScript project-reference pattern extended to `apps/server`; no package or runtime dependency was added. The evaluator initially produced a valid but unaligned Markdown table, so it now emits stable column widths and passes formatting immediately after regeneration.
- Environment limitation: the desktop terminal backend could observe `pnpm demo` reaching its loopback URL but could not send Ctrl+C to its foreground process. The process was stopped without source changes; focused lifecycle tests call the same close path and prove owned-root cleanup.

## External authorization boundary

The user authorized Phase 7 engineering work. They have not authorized publishing a video, sharing repository access, creating or submitting Devpost content, or transmitting a feedback session identifier. Phase 7 prepares these artifacts but does not perform those external actions.
