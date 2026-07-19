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

### Pollable review execution

- RED: authenticated dashboard start-route tests returned `404` because no asynchronous worktree or pull-request entry points existed.
- GREEN: both strict start routes return `202` with a queued operation, while the existing synchronous routes retain their ReviewRun responses for CLI and MCP compatibility.
- RED: focused composition tests showed the preallocated operation ID was discarded by both CLI review functions in favour of their fallback ID factories.
- GREEN: worktree and pull-request composition accept the service-owned ID while preserving the original fallback for direct CLI calls.
- GREEN: service tests held the underlying work at explicit boundaries and observed worktree `queued`/`evaluating_change`/`completed` and pull-request `syncing_history`/`evaluating_change`/`completed` transitions with matching final identities.
- GREEN: a restart test persisted a running operation, reopened the service, and observed a bounded failed state rather than an indefinitely running review.

### Findings and corrections

- The first route test exposed an integration boundary: the test server had an operation reader, but the real service adapter did not yet forward it. The service now exposes the same Project Memory method, and the deep-link route checks operation state before the legacy review row.
- The asynchronous pull-request path reuses the existing GitHub synchronization and review functions. It does not duplicate provider logic or introduce a background-worker abstraction.
- The detached operation owns a terminal catch so failures cannot become unhandled promise rejections. User-visible failures remain generic and never include repository content, provider output, paths, tokens, or raw exception text.
- The first combined quality command used unsupported `&&` syntax in the available Windows PowerShell and was rejected before any command ran. The acceptance commands were rerun independently; lint then caught three unsafe test-only `response.json()` returns, which were corrected by parsing the shared lookup contract.

### Relationship-aware inspector data

- RED: 5 of 50 focused tests failed because linked memory results discarded relationship types, no timeline contract or builder existed, and completed operations had no comparison inputs.
- GREEN: the strict memory result retains an optional explicit relationship; exact and FTS results remain unchanged. The SQLite linked query selects `l.type` while its existing `ORDER BY l.position` preserves link order.
- GREEN: the pure Project Memory timeline test produced the Ghost sequence `proposal -> implementation -> incident -> revert -> decision -> revived_change`, deduplicated repeated pointers, capped fallback context at fifty items, and omitted unsafe links.
- RED: the real Ghost service route completed with an empty timeline, proving persistence alone did not compose inspector data.
- GREEN: the completed lookup now joins the previous immutable ReviewRun and relationship-aware timeline. Two consecutive Ghost operations proved previous-review identity and the six historical roles.

### Findings and corrections

- The first Ghost composition returned two extra lexical context matches after the exact linked chain. When any exact or linked evidence exists, the timeline now excludes lower-authority FTS spillover; FTS remains the bounded context fallback only when no identity chain exists.
- A superseded implementation is derived only from an explicit `supersedes` relationship to a pull request. An active ADR targeted by the current proposal remains active; Gatekeeper does not claim that an unmerged change already superseded repository authority.
- Remote links are emitted only for credential-free `https://github.com` URLs. Repository paths become GitHub blob links only when both normalized repository identity and a safe relative path are available; otherwise the item remains useful plain text with no link.
- Comparison data is not persisted as a second truth. The completed contract carries the prior review, current review, evidence hashes, and superseded statuses so the dashboard can derive resolved, remaining, and unchanged evidence by stable IDs.
- The first root lint run for this slice caught one stale test-only `ReviewId` import left after switching the Ghost runner to the service-preallocated ID. It was removed before verification.
- Fresh root gate: lint and typecheck passed; 39 files and 256 tests passed; the production dashboard build completed.

### Dashboard remediation loop

- RED: 3 of 4 focused client tests failed because the dashboard client had no start methods and parsed queued operations as invalid ReviewRuns.
- GREEN: the client starts one worktree or pull-request operation, performs no duplicate repository/GitHub-sync request, forwards abort signals, and parses the shared lookup union.
- RED: the first inspector test could not resolve the new visual owner; after the component existed, focused assertions exposed split comparison text and clipboard test setup rather than product failures. Both tests were corrected to exercise semantic output and the browser clipboard boundary accurately.
- RED: the legacy detail route treated queued and failed operation objects as completed reviews and crashed while reading missing metrics.
- GREEN: the detail route now narrows queued, running, failed, completed, and legacy ReviewRun branches; only queued/running branches poll, and completed or failed branches stop automatically.
- GREEN: 37 dashboard tests cover immediate deep-link navigation, real stages, offline and persisted failures, all verdicts and authorities, semantic timeline order, safe external/internal links, native excerpts, plain-text hostile HTML, partial history, grouped remediation, clipboard success/failure, re-review, stable comparison, legacy routes, and URL-driven memory search.

### Findings and corrections

- The old pull-request client synchronized history and then called the synchronous review route. The new start endpoint already owns that sequence, so the dashboard now makes exactly one authenticated start request and cannot accidentally duplicate GitHub synchronization.
- Completed pull-request operations retain the existing bounded `GitHubSyncResult` as nullable `historySync`. This preserves truthful partial-history UI without adding a dashboard request, sync store, or new endpoint; worktree and legacy operations use `null`.
- One attempted test-suite compression inserted malformed patch text into the test helper. Direct inspection caught it before a test or commit; the test file was recreated cleanly and no product code was affected.
- The fresh Web Interface Guidelines audit found two existing `:focus` selectors on the changed surface, a missing search `autocomplete`, and a vague placeholder without an ellipsis. They now use `:focus-visible`, `autocomplete="off"`, and an example placeholder; stable IDs and paths also opt out of translation.
- Impeccable static detection, including GPT-specific provider tells, returned zero findings for the dashboard source and HTML entry point.
- The inspector preserves the approved OpenAI/Codex-inspired graphite tokens and IBM Plex Sans. New sections use one restrained hierarchy, semantic boundaries, one timeline rail, and no charts, gradients, icon pack, animation library, nested dashboard cards, or invented metrics.
- Fresh root gate: lint, typecheck, formatting, and diff checks passed; 41 files and 253 tests passed; the production dashboard build completed. The verified slice removes 254 more lines than it adds while replacing the synchronous dashboard path with the persisted remediation loop.

### Real-browser Ghost Change proof

- RED: the exact Playwright command failed because the repository did not yet contain the planned browser dependency.
- RED: the first real browser run rendered five timeline nodes. The temporary repository ADR had not been indexed, unlike the existing service integration setup, so the decision evidence was truthfully absent.
- GREEN: the fixture now registers and indexes the temporary repository through the authenticated real API before starting PR #12. The browser observes progress, `ESCALATE`, all six ordered evidence roles, remediation, clipboard output, restart persistence, `FAST_PATH`, and the stable before/after comparison.
- The test initially found two assertion defects after the product path had succeeded: an unscoped `FAST_PATH` locator matched the verdict, summary, and comparison; a body click did not clear the previously focused button. The assertions now scope comparison output semantically and reload the persisted route before proving the skip link is the first visible keyboard focus.
- The Playwright fixture adds only pinned `@playwright/test` and Chromium configuration. It uses a temporary Git repository, the exported Ghost provider, the real SQLite-backed service, and the built dashboard; no production demo server, network call, GitHub authentication, or model key was added.
- Full-page screenshots at 1440x900, 1280x720, and 1024x768 plus the 1440px escalation state were each inspected. Hierarchy, wrapping, timeline continuity, comparison, controls, and horizontal containment remained sound at every size.

### Attack and audit conclusions

- The browser rejects PR number zero through native constraint validation and never starts an operation. Focus visibility, reduced motion, clipboard access, deep-link restart, and document overflow are asserted in Chromium.
- Existing focused tests cover operation-ID ownership collisions, failing callbacks, corrupt persisted operation JSON, interrupted operations, offline lookup/polling, unsafe URLs, hostile `<script>` excerpts rendered as text, and 2,000-character evidence bounds. These attacks remain below the shared contract/service/storage boundaries rather than being duplicated as theatrical browser cases.
- The fresh Web Interface Guidelines review of the changed dashboard surface and the Impeccable detector both returned no remaining applicable findings after the Task 5 corrections.
- Ponytail removed a redundant pre-check from the overflow helper. The final phase diff retains one operation table, two start routes, one polling query, one browser dependency, and no queue, SSE layer, retry framework, UI library, chart, animation dependency, or future-phase surface. Lean already; ship.
- Final fresh gate on 2026-07-19: lint, TypeScript (including Playwright), 41 Vitest files / 253 tests, production build, one Playwright Chromium acceptance, formatting, high-severity dependency audit, and diff checks all passed. The audit found no known vulnerabilities.

## Scope ledger

Deferred by the Phase 6 stop gate: settings, policy editors, collaboration, analytics, user accounts, remote hosting, permanent decision writes, decorative charts, and Phase 7 packaging/submission work.
