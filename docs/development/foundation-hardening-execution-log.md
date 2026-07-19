# Foundation hardening execution log

## Scope

This user-authorized post-freeze hardening pass closes the five concrete audit findings in `docs/superpowers/plans/2026-07-19-foundation-hardening.md`. It retains one local foreground service for one fixed repository. No hosted process, worker, queue, retry system, dependency, GitHub write, target-repository mutation, or public product surface was added.

## Baseline

- Branch: `master`, aligned with `origin/master` at `f7af6c2`.
- Local SQLite quick check: `ok`.
- `git fsck --strict --no-dangling`: clean.
- Doctor found writable app data, SQLite/WAL/FTS5, and optional `gh` unavailable; the latter remains a warning only.
- Initial audit: 49 Vitest files / 283 tests, two Chromium stories, high-severity dependency audit, and the historical-review release matrix passed.

## Task 1 — service ownership

- RED: a second local service could share metadata and interfere with another foreground review.
- GREEN: an exclusive `0600` owner lock is acquired before SQLite. A live PID rejects a second start without touching its metadata; a valid abandoned PID lock is reclaimed once.
- Evidence: focused service lifecycle tests, lint, and type checks passed. Commit `ac3d6ed`.

## Task 2 — live repository identity

- RED: a reused checkout root could resolve an old remote's memory, and freshness compared against the startup HEAD.
- GREEN: registration/indexing fail closed if normalized root/remote identity drifts; status inspects the live fixed repository before reporting freshness.
- Evidence: Project Memory and service identity/freshness tests, lint, and type checks passed. Commit `2a4e2e9`.

## Task 3 — terminal operation lifecycle

- RED: concurrent dashboard starts were accepted; a fallback persistence failure could leave polling queued/running; an old held task could resume after shutdown.
- GREEN: one active local operation is admitted, terminal failures remain visible in memory when their SQLite write fails, and shutdown prevents resumed tasks from persisting a completion.
- Evidence: 41 focused service tests, lint, type checks, formatting, and diff checks passed. Commit `4db277c`.

## Task 4 — corrupt local operation recovery

- RED: malformed operation JSON could block normal startup with no bounded diagnosis or local recovery action.
- GREEN: startup and Doctor fail closed; normal Doctor reports the explicit repair command. `doctor --repair` uses native SQLite backup before one immediate transaction removes only malformed operation rows, preserving valid operations and review runs.
- GREEN: the real compiled `doctor --repair --format json` found the local database healthy and performed no deletion. Node, pnpm, Git, writable app data, native SQLite, WAL, FTS5, and stored state passed; optional `gh` remained a warning.
- Correction: exact optional-property typing required an explicit boolean at the Commander boundary; the repair flag now passes `true` or `false`, never `undefined`.
- Evidence: 73 focused SQLite/CLI/service tests, full 49-file / 294-test suite before Task 5, build, lint, type checks, formatting, and diff checks passed. Commit `74413ae`.

## Task 5 — full historical target identity

- RED: two full commit SHAs sharing the same twelve-character display prefix linked as previous reviews. The target-key column did not exist.
- GREEN: migration `0003_review_target_key` adds and indexes a non-null private key. Existing empty legacy keys are backfilled in an immediate transaction only after strict ReviewRun parsing; malformed legacy JSON fails the migration rather than guessing an identity.
- GREEN: historical commit lookup keys by the complete SHA; worktree and pull-request keys retain their stable existing target identity. The public display remains unchanged.
- GREEN: root, merge, rename/binary/deletion, and non-commit extraction tests now additionally prove unchanged branch, HEAD, index, and worktree state.
- GREEN: the compiled Doctor migrated the existing local Project Memory database and reported valid stored state, WAL, FTS5, and native SQLite. Optional `gh` remained the expected warning; no repair or deletion was requested.
- Correction: the final formatting gate identified only the new SQLite test file; formatting was applied and the targeted storage/Git suite was rerun.

## Final verification

- `pnpm install --frozen-lockfile`: PASS.
- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- `pnpm test`: PASS — 49 files, 297 tests.
- `pnpm build`: PASS.
- `pnpm playwright test`: PASS — both Chromium stories.
- `pnpm demo:smoke` and `pnpm eval`: PASS — six expected verdicts, zero external network and model calls.
- `pnpm model-data:dry-run`: PASS — `transport: none`, `modelCalls: 0`.
- `pnpm format:check`, `pnpm audit --audit-level high`, `git fsck --strict --no-dangling`, and `git diff --check`: PASS.

## Residual boundaries

- Corrupt review-run JSON remains fail-closed and is never automatically deleted; the explicit repair path is limited to corrupt review-operation rows.
- A repair is local-only and should be requested after stopping the foreground service. It does not reset Project Memory, alter Git state, or disclose source/diff content.
- Gatekeeper remains a single fixed-repository local service. Project selection, hosted collaboration, background work, GitHub publication, target-repository mutation, and model verdicts remain out of scope.
