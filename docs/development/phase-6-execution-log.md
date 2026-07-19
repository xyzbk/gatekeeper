# Phase 6 execution log

## Scope

Phase 6 turns the persisted review pipeline into the dashboard hero experience: real review progress, an ordered evidence timeline, remediation prompts, and before/after re-review comparison. It stops before settings, policy editing, collaboration, analytics, accounts, remote hosting, or decorative dashboard features.

## Fixed decisions

- Existing synchronous worktree and pull-request POST routes remain available for CLI and MCP compatibility.
- Dashboard operations start through explicit asynchronous POST routes and poll the existing review deep link.
- The foreground service schedules one caught in-process promise. There is no worker, queue, retry framework, SSE stream, or crash-resume job.
- Queued or running operations interrupted by service restart become a persisted bounded failure state.
- Review IDs are preallocated and passed into the existing review composition so the progress route and final durable ReviewRun share one identity.
- Completed inspector data may join the previous review and Project Memory evidence, but verdict assembly remains owned by the review engine.
- Prompt buttons copy local text only. They do not call, embed, or impersonate Codex.
- The existing dark graphite tokens and IBM Plex Sans are preserved.

## Baseline

- Starting branch: `master` aligned with `origin/master`.
- Starting commit: `f6ab297e8453000d47939665b2b2ceeba2ac2fa7`.
- Starting tracked worktree: clean.

## TDD evidence

Expected RED states, GREEN results, unexpected failures, and corrections are appended per verified task. No RED state is committed or pushed.

### Review-operation contracts and persistence

- RED: the focused contract run failed because `reviewOperationSchema` did not exist; 1 of 13 tests failed for the expected missing behavior.
- GREEN: queued, running, failed, and completed strict operation branches passed 13 focused contract tests.
- RED: the SQLite suite failed 4 of 19 tests because migration `0002_review_operations` and the three operation methods did not exist.
- GREEN: the append-only migration, repository-owned upsert, atomic completion, corrupt-data rejection, restart interruption, and reopen persistence passed all 19 store tests.
- RED: the Project Memory suite failed 1 of 9 tests because its operation lifecycle methods did not exist.
- GREEN: the existing Project Memory boundary forwards save/get/interruption without a new repository abstraction; all 9 focused tests passed.
- Fresh root gate: lint and typecheck passed; 38 files and 248 tests passed; the production dashboard build completed.

### Findings and corrections

- The accepted `review_runs` table already proves completed status. The additional row stores only the live operation contract and is updated in the same SQLite transaction when its matching review is saved.
- A review-operation ID collision cannot move state between repositories; the upsert returns zero changes and fails closed.
- A corrupt operation blocks unsafe recovery with a stable `CORRUPT_DATA` error. It is never parsed leniently or returned to the dashboard.

## Scope ledger

Deferred by the Phase 6 stop gate: settings, policy editors, collaboration, analytics, user accounts, remote hosting, permanent decision writes, decorative charts, and Phase 7 packaging/submission work.
