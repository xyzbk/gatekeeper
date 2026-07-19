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
