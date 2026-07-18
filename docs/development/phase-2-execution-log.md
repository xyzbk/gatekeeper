# Phase 2 execution log

Status: ACTIVE

Started: 2026-07-18

Goal: deliver the canonical deterministic worktree-review phase and stop before persistence, MCP, model reasoning, or GitHub review.

## Working rules

- Every behavior begins with a failing focused test.
- Expected RED failures and unexpected failures are recorded with their cause and correction.
- Only verified green commits are pushed to `origin/master`.
- Repository content is treated as untrusted data and never copied into logs.

## Baseline

The repository began Phase 2 clean on `master` at `807a5c7175b79a16ce9ae819a9fcf9c1eb6b245a`, equal to `origin/master`.

Commands run on 2026-07-18:

```text
pnpm install --frozen-lockfile  PASS
pnpm lint                       PASS
pnpm typecheck                  PASS
pnpm test                       PASS — 14 files, 51 tests
pnpm build                      PASS
```

No baseline failure was observed. pnpm reported that 11.14.0 exists; the project remains intentionally pinned to pnpm 11.9.0 for reproducibility.

## Decisions

- Execute inline on `master`: the user previously required every passing step on `origin/master`, and the canonical plan forbids delegation without explicit permission.
- Use one new runtime dependency, `ignore`, only for Git-compatible `.gatekeeperignore` and policy-pattern semantics. Native Git continues to own `.gitignore` handling.
- Expose bounded file summaries and added-line inspection only inside the Git/review boundary; CLI, API, dashboard, and logs never receive raw diffs.
- Include `contentTruncated` in each change summary so policy and presentation layers can disclose when bounded added-line evidence is incomplete instead of silently treating it as complete.
- Use disposable generated Git repositories for acceptance because nested `.git` directories cannot be committed safely.

## Task 1 evidence

Expected RED:

- The contract export test failed because `changeSetSchema` did not exist.
- Strict contract examples failed against the minimal placeholder schema.
- The provider seam test failed because `getWorktreeDiff` did not exist.
- Real repository extraction cases failed against the intentionally empty placeholder implementation.
- The extended review fixture was rejected because `pathGroups` and `changes` were not yet in the strict ReviewRun schema.
- The committed JSON Schema drift test failed after the Zod contract changed, then passed after deterministic regeneration.

Corrections and learning:

- Zod rejected `.omit()` on a refined object. The schemas now share an unrefined base shape and apply their refinements independently.
- `exactOptionalPropertyTypes` exposed an optional-property helper mismatch. The helper accepts explicit `undefined` without weakening the serialized schema.
- A focused package-only TypeScript invocation saw stale dependency declarations while the supported root project-reference typecheck passed. Validation uses the root command so referenced packages build in dependency order.
- A regression test found that exactly 500 inspected added lines were incorrectly marked truncated. The cap now becomes incomplete only on line 501 or when a line exceeds 2,000 characters.
- One regression assertion used an unsupported asymmetric `toHaveLength` matcher. The assertion was split into supported object and array checks; product behavior was unchanged.
- The first root lint run found an unused 2 MiB bound. The bound is now enforced explicitly on every injected Git result as well as by execa, closing the test seam instead of deleting the safety constant.
- Final safety review found that `.trim()` could transform a Git path and that control characters were still accepted. A new RED contract case now requires paths to be unchanged, whitespace-clean, and control-character-free before filesystem resolution.
- ESLint correctly rejected a control-character regular expression used by the first fix. The same validation now uses explicit Unicode code-point checks without suppressing the rule.

No repository content, diff text, tokens, or secrets were written to this log.

## Task 2 evidence

Expected RED:

- The focused engine suite failed to load because `review-worktree` did not exist.
- Nine behavior cases passed after the minimum pure engine and package wiring were added.

Corrections and learning:

- The first root typecheck rejected a rest-destructured optional `previousPath` under `exactOptionalPropertyTypes`, and lint rejected the unused discarded `addedLines` binding. A small explicit summary mapper now omits `previousPath` when absent and never carries inspected source lines into ReviewRun.
- The same pre-format gate correctly reported the new files and lockfile as unformatted. No formatting exception was added.

No policy finding is produced from model inference, and the existing verdict regression confirms that an inference finding cannot produce `BLOCK`.

## Task ledger

| Task                                 | State    | Commit    | Verification                                                               | Failures and corrections  |
| ------------------------------------ | -------- | --------- | -------------------------------------------------------------------------- | ------------------------- |
| 1. Contracts and worktree extraction | complete | this step | Focused: 20/20 PASS; root lint/typecheck/test (63)/build/format/audit PASS | See Task 1 evidence above |
| 2. Deterministic review engine       | complete | this step | Focused: 9/9 PASS; root lint/typecheck/test (72)/build/format/audit PASS   | See Task 2 evidence above |
| 3. Policy loader, CLI, fixtures      | pending  | —         | —                                                                          | —                         |
| 4. Local review API                  | pending  | —         | —                                                                          | —                         |
| 5. Review Inspector                  | pending  | —         | —                                                                          | —                         |
| 6. Acceptance and documentation      | pending  | —         | —                                                                          | —                         |

## Scope boundary

No SQLite, Project Memory, FTS5, MCP server, Codex skill, model call, GitHub call, or pull-request review belongs in this log or phase.
