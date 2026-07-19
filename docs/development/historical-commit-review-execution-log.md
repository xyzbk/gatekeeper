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
