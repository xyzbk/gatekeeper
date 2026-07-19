# Historical commit review execution log

## Scope

This is a user-authorized post-freeze extension, not a release-blocking correction. It adds one immutable historical-commit review path and a ten-row indexed commit history surface. It does not add repository selection, commit browsing, pagination, GitHub writes, background indexing, a new dependency, or a database migration.

Historical reviews compare a selected full commit object ID with its first parent. Root commits use Git's empty tree; merge commits use their first parent. The current checked-out Gatekeeper policy and ignore rules apply. Git reads must not alter the target worktree.

## Baseline

- Branch: `master`, aligned with `origin/master`.
- Baseline test command: `pnpm test`.
- Baseline result: 47 test files and 262 tests passed on 2026-07-19.

## Task 1 — contracts

- RED: new contract tests failed as expected because `commit_range` was absent from `ChangeSet`, and `commitReviewInputSchema` / `recentCommitEvidenceResponseSchema` did not exist.
- GREEN: strict commit-review input, immutable commit target, and bounded recent-commit response contracts now pass their focused tests.
- Correction: the approved `40–64` object-ID compatibility range intentionally accepts intermediate lengths for forward compatibility, matching existing Project Memory commit contracts. The initial test incorrectly rejected 41 characters and was corrected; short, uppercase, option-like, malformed, and extra-field inputs remain rejected.
- Verification: focused contracts tests and `pnpm exec tsc -b packages/contracts/tsconfig.json --pretty false` pass.

## Task 2 — immutable Git extraction and deterministic review

- RED: the first historical extraction test failed because `GitProvider.getCommitDiff` did not exist. Engine tests then failed because `reviewCommit` did not exist, and the CLI composition test failed because its module was absent.
- GREEN: one private tracked-diff collector now serves both worktree and historical paths. Historical extraction resolves only a validated commit object, reads its first parent (or the Git-computed empty tree for a root commit), disables external diff/text conversion, enforces the existing output/path/file/line limits, and never checks out or changes repository state.
- GREEN: real temporary-repository coverage proves normal, root, merge, rename, binary, deletion, current-ignore, malformed-ID, non-commit, and branch/HEAD/index/status preservation behavior. The deterministic engine adds only a target-kind guard and delegates all findings/verdict assembly to `reviewChangeSet`.
- GREEN: `runCommitReview` loads the current repository policy, forwards its ignore patterns to immutable extraction, and uses the existing deterministic engine and review contract.
- Verification: 5 focused test files / 36 tests passed; Git adapter, review engine, and CLI TypeScript project builds passed; Prettier and `git diff --check` passed.

## Task 3 — persistence, CLI, and local API

- RED: the Project Memory command test failed because `reviewCommit` was absent; the authenticated local API test then returned `404` because the commit routes did not exist.
- GREEN: `gatekeeper review commit <full-sha> [path]` uses the existing local Project Memory session, persists its review, and scopes its previous-review lookup to the selected SHA's stable target display. Invalid input is rejected by the shared contract before Git extraction.
- GREEN: the loopback API exposes `POST /v1/reviews/commit` and `/v1/reviews/commit/start` with the same strict schema. The dashboard operation uses only `evaluating_change` and `persisting_review`, carries `historySync: null`, and uses the existing durable operation/read/detail paths.
- GREEN: CLI startup forwards the same local callback into the service. Test-only direct service compositions may omit that callback; their commit endpoint fails through the existing bounded local-review error path rather than silently reviewing another target.
- Verification: 3 focused test files / 44 tests passed; CLI and server TypeScript project builds passed; Prettier and `git diff --check` passed.

## Task 4 — recent commit evidence

- RED: storage and Project Memory tests failed because neither the SQLite store nor the memory facade exposed recent commits. The authenticated `GET /v1/memory/commits` test then returned `404` because the local service route was absent.
- GREEN: one prepared SQLite query against the existing `commits` table orders by authored time and SHA, limits results to ten, and returns only SHA/date/title. No table, migration, cursor, cache, commit body, or raw diff was added.
- GREEN: Project Memory and the fixed-repository loopback API return the same strict bounded response. The API is bearer-protected by the existing `/v1` hook and accepts no query parameters.
- Verification: 3 focused test files / 67 tests passed; store, Project Memory, and server TypeScript project builds passed; Prettier and `git diff --check` passed.

## Task 5 — Memory history grid

- RED: dashboard client tests failed because neither recent-commit fetch nor commit-operation start existed. The route tests then exposed two integration errors: disabled history queries retain cache data, and a direct TanStack mutation function receives a context argument.
- GREEN: Memory uses separate query states: no submitted query displays a semantic ten-row recent-commit table; a submitted query replaces it with search results; `Clear search` restores it. Commit titles render as text with explicit untrusted/first-parent scope.
- GREEN: `Review commit` starts the existing persisted operation and navigates to the existing Review Inspector. Re-review supports commit targets; a failed commit operation returns to Memory.
- Correction: render history only while the submitted query is empty, and wrap the mutation client call so only the SHA reaches the transport boundary.
- Verification: 4 focused dashboard test files / 21 tests passed; dashboard typecheck/build, Prettier, and `git diff --check` passed.

## Task 6 — Codex MCP and Gatekeeper skill

- RED: MCP client tests could not request the fixed service's commit routes, and the official MCP client exposed no commit-history or commit-review tools.
- GREEN: `gatekeeper_list_recent_commits` returns the same bounded ten-row evidence response as Memory. `gatekeeper_review_commit` accepts only one strict full SHA, creates the existing persisted deterministic draft, and never selects a path, remote, branch, range, or process.
- GREEN: the nine-tool registry explicitly labels recent history read-only and commit review local-write/non-idempotent. The Gatekeeper skill teaches selection from the bounded list, first-parent/current-policy semantics, untrusted titles, and the no-checkout boundary.
- Findings: focused tests initially exposed a commit draft lookup fixture collision and an order mismatch between the public tool-name constant and registration. Both were fixed without expanding the public surface.
- Verification: official in-memory and real stdio MCP suites, client contracts, repository-surface skill checks, MCP TypeScript build, Prettier, and `git diff --check` passed.
