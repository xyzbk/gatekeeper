# Phase 5 execution log

## Scope

Phase 5 adds bounded read-only GitHub history, explicit remote relationships in Project Memory, pull-request review through CLI/API/MCP/dashboard, and the reproducible Ghost Change fixture. It does not publish to GitHub or begin Phase 6 dashboard comparison work.

## Baseline

- Starting commit: `60150c053a216ebdb3056aa9d6b784132b457c74`.
- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- `pnpm test`: PASS (32 files, 183 tests).
- `pnpm build`: PASS.
- Local `master`, `origin/master`, and the fetched remote `master` were aligned at the starting commit.
- GitHub CLI: not installed in the current Windows environment. The provider will be developed and accepted against injected/offline command fixtures; live read-only verification remains conditional on an installed, authenticated `gh` and an existing approved demo repository.

## Contract audit

- `gatekeeper sync github [path]` resolves the GitHub remote from one local repository; it does not accept an `owner/repo` pseudo-path as a filesystem path.
- `gatekeeper review pr` creates and persists the deterministic PR review. Codex receives ranked evidence through the draft and authors evidence-supported or inference findings through the existing completion handshake. Gatekeeper always assembles the verdict.
- The production GitHub adapter is read-only. The isolated demo seeder defaults to dry-run, and implementing its explicit `--apply` path is not authorization to execute it against GitHub.
- Default acceptance remains fully network-, auth-, and model-free through one exported fixture that exercises the same parsing and normalization path as the provider.

## Execution evidence

### Task 1 — execution contract

- Commit `9ee72ab` corrected the local-path acceptance syntax, separated deterministic review from Codex completion, isolated seeder authorization, and added this plan/log. It was pushed to `origin/master`.
- Markdown formatting and `git diff --check`: PASS.

### Task 2 — strict remote contracts and read-only gh provider

Expected RED:

- The new GitHub contract test could not import the not-yet-created `github.ts` module.
- The provider suite could not import the not-yet-created `github-provider.ts` module.
- The existing change-set schema rejected a pull-request target because it allowed only the worktree literal.

Implemented:

- Strict GitHub remote, preflight, sync-limit, pull-request, remote-record, partial-failure, and history-batch contracts.
- A pull-request change-set target that leaves the accepted worktree literal unchanged.
- `packages/github-gh` with HTTPS/SSH remote normalization, authenticated-host preflight, typed pull-request metadata, passing/failing/pending check aggregation, bounded file-diff extraction, bounded history for issues/PRs/comments/reviews, partial malformed-record survival, and injected argument-array process execution.
- Production `gh` calls are limited to `auth status`, `pr view`, and explicit GET `api` endpoints; process stdin is ignored, shell execution is disabled, output is capped at 2 MiB, and timeouts are bounded.

Unexpected failures and corrections:

- The first implementation built the issues endpoint with a misplaced query separator, so the malformed-record survival test received no records. The endpoint now uses one valid `?state=all&...` query.
- Strict optional-property inference exposed a mismatch between contract pull-request refs and the domain `ReviewTarget`. The shared domain target now states the exact optional semantics instead of relying on an adapter cast.
- The first production-source safety test treated the read-only record kind `review` as if it were a `gh pr review` command. The guard now detects mutating command sequences and mutating API methods specifically.
- Root lint found test-only async functions without `await` and one unsafe matcher assignment. The fakes now return explicit promises and assertions inspect typed fields directly.

Aggressive checks:

- Credential-bearing, extra-segment, query/fragment, shell-metacharacter, file, and ambiguous remotes are rejected before execution.
- Missing `gh` and failed authentication return bounded errors and repair instructions without surfacing captured stderr.
- Invalid PR numbers do not invoke the runner.
- Pull requests above the configured file cap fail closed.
- One malformed history record produces a partial batch while retaining valid records.
- A source guard rejects mutating `gh` subcommands and non-GET API methods in the production provider.

GREEN:

- Focused contract/provider tests: PASS (22 tests before added hostile cases; 25 after).
- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- `pnpm test`: PASS (34 files, 203 tests).
- `pnpm build`: PASS.

### Task 3 — incremental remote Project Memory

Expected RED:

- The accepted migration did not contain `sync_cursors` or remote URL/link ordering columns.
- `SqliteProjectStore` had no remote-sync or cursor operation.
- `ProjectMemory` had no remote normalization/indexing operation.

Implemented:

- Added the append-only `0001_github_history.sql` migration; the accepted Phase 3 migration remains unchanged.
- Added repository/provider-scoped cursors, bounded GitHub evidence URLs, and stable ordered document links.
- Added atomic remote upserts that coexist with local ADR/document/commit indexing. A subsequent local re-index cannot delete GitHub history.
- Added deterministic remote normalization for issues, pull requests, comments, and reviews plus explicit parent links, linked numbers, revert/resolution phrases, and bounded `Gatekeeper-Relation` markers.
- Search now returns exact identities first, their ordered explicit links second, and FTS matches last.

Aggressive finding and correction:

- A complete but stale replay initially rewound the cursor and overwrote newer evidence. A new RED test reproduced both failures. Remote writes now retain the newer timestamped document, and cursor upserts keep the greatest completed cursor.
- A partial batch persists its valid documents atomically but never advances the cursor, so malformed records remain eligible for retry.
- Repeat sync writes zero unchanged documents/links, cross-source local/remote indexing remains isolated, and an exact PR identity excludes a coincidental Redis lexical match from the bounded result.

GREEN:

- Focused migration, persistence, normalization, relationship, ranking, partial, replay, and local/remote coexistence tests: PASS (24 tests).
- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- `pnpm test`: PASS (34 files, 207 tests).
- `pnpm build`: PASS.

### Task 4 — deterministic pull-request review and CLI adapters

Expected RED:

- The review engine did not export a pull-request reviewer, so the new PR behavior suite failed at import/use time.
- Project Memory CLI composition had no GitHub sync or pull-request review commands.

Implemented:

- Generalized the existing deterministic change-set evaluator while retaining `reviewWorktree` as its stable wrapper.
- Added `reviewPullRequest`, which validates target identity, evaluates the same policy table, records GitHub check state, and turns prompt-injection-like pull-request descriptions into an inert content-security escalation with a bounded GitHub evidence URL.
- Added the positive-integer `review pr <number> [path]` and local-path `sync github [path]` commands.
- Composed local repository identity, normalized remote resolution, authenticated read-only provider calls, incremental remote memory, policy evaluation, persisted reviews, and previous-review linkage without adding domain behavior to Commander or the provider.
- Classified missing `gh` or authentication as exit `3` with repair guidance, bounded sync failures as exit `4`, and retained verdicts as successful product output.

Unexpected failures and corrections:

- A misplaced type-only import line produced an OXC parse error. The import was restored to the contracts import block.
- The focused test initially loaded the package's prior compiled export and could not see `pullRequestToRemoteRecord`. Rebuilding the referenced composite package restored the workspace package boundary; root typecheck/build remains the authoritative clean-build path.

Aggressive checks:

- A pull-request number that disagrees with the fetched target is rejected before review assembly.
- Hostile description text plus passing checks yields `ESCALATE`, retains a safe clickable evidence URL, and never creates a hard-authority finding.
- A clean Redis lexical mention with passing checks remains `FAST_PATH`; historical wording alone does not change the deterministic verdict.
- GitHub provider failures expose bounded classifications and repair text rather than captured stderr or remote bodies.

GREEN:

- Focused engine/CLI composition tests: PASS (17 tests).
- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- `pnpm test`: PASS (34 files, 210 tests).
- `pnpm build`: PASS.
- Compiled command help and invalid zero-number rejection: PASS.

Further RED states, GREEN commands, unexpected failures, corrections, aggressive-test findings, and commit hashes will be appended per verified task.
