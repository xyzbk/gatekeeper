# CLI reference

Build the workspace, then run the source CLI through pnpm:

```bash
pnpm build
pnpm --filter @gatekeeper/cli start -- <command>
```

The compiled equivalent is `node apps/cli/dist/index.js <command>`.

## `doctor`

Checks Node, pnpm, Git, optional `gh`, the writable app-data path, the native SQLite driver, the Project Memory database in WAL mode, and FTS5 without authenticating or making a network request.

```bash
gatekeeper doctor
gatekeeper doctor --format json
```

## `policy validate [path]`

Resolves the Git repository containing `path` and validates its required `.gatekeeper/policies.yaml`.

```bash
gatekeeper policy validate .
```

Success prints the policy path. Missing, unsafe, oversized, malformed, or schema-invalid policy returns exit code `2` with a stable message. Unknown policy fields and invalid values report dotted paths without echoing YAML content.

## `review worktree [path]`

Reviews staged, unstaged, and untracked changes for the containing Git repository.

```bash
gatekeeper review worktree .
gatekeeper review worktree . --format json
```

`human` is the default format. It prints the verdict, summary, counts, finding authority/severity, affected paths, and remediation. `json` emits the strict ReviewRun v1 contract documented in [verdicts.md](verdicts.md). Completed worktree reviews are stored in Project Memory; a later review of the same target records the prior review ID.

The review loads `.gatekeeper/policies.yaml` when present and otherwise uses an empty version-1 policy. It never accepts a base branch, remote, URL, pull request, arbitrary file, or policy text through the command line.

### Exit behavior

For `policy validate` and `review worktree`:

- `0`: validation or review completed, including `REQUIRE_CHANGES`, `ESCALATE`, or `BLOCK`;
- `2`: policy/configuration error;
- `3`: repository, Git, or bounded-worktree environment error;
- `6`: unexpected internal review failure.

A verdict is product output, not a process failure. Phase 2 intentionally has no enforcement flag and never mutates the target repository.

## Project Memory

Project Memory is a local SQLite database stored under Gatekeeper's machine app-data directory, never inside the target repository by default. Register and incrementally index one repository:

```bash
gatekeeper repo init .
gatekeeper repo status . --format json
gatekeeper index .
gatekeeper memory search "redis cache" . --format json
gatekeeper review show review_<id> --format json
gatekeeper sync github .
```

The index stores tracked file metadata and hashes, bounded Markdown/ADR/policy excerpts, and up to 200 recent commit records. It does not store full private source files. Gatekeeper excludes ignore-matched paths, known secret/config names, non-regular files, oversized documents, and invalid UTF-8. Every returned repository excerpt is labelled `untrusted_repository_content`; exact path/source/title matches precede FTS5 matches.

`repo status` is read-only with respect to repository registration. `index` and `memory search` require prior initialization. A repeated unchanged index reports zero writes. `review show` reads a strict persisted ReviewRun v1 by ID.

`sync github` also requires prior initialization. It derives the GitHub repository from the local repository's `origin` remote, verifies `gh` authentication, and imports a bounded batch of issues, pull requests, comments, and reviews. The production command is read-only: it does not create, edit, label, comment on, close, merge, or otherwise mutate GitHub content. Complete batches advance an incremental cursor; partial batches keep their valid records but retain the cursor so malformed records can be retried.

## `review pr <number> [path]`

Reviews one positive-numbered pull request belonging to the local repository and registers that repository in Project Memory when needed:

```bash
gatekeeper review pr 42 .
gatekeeper review pr 42 . --format json
```

The command resolves and validates the local repository's GitHub remote, reads bounded pull-request metadata and files through authenticated `gh`, then evaluates the resulting change set with the same deterministic policy engine used by `review worktree`. GitHub check status and prompt-injection-like pull-request text become inert findings and evidence; remote text is never treated as an instruction. The review is persisted with previous-review linkage and the current pull request is indexed as remote Project Memory evidence.

Passing checks are advisory evidence. Failed required checks require changes, pending checks escalate for human judgment, and suspicious instruction text escalates. Model-authored conclusions may add evidence-supported findings or escalate, but cannot produce `BLOCK`; only deterministic policy rules can do that.

Project Memory command exit codes are:

- `0`: command completed, including an empty search or non-fast-path verdict;
- `2`: usage, policy/configuration, invalid query, not-initialized, or not-found error;
- `3`: Git, GitHub CLI/authentication, native SQLite, database, or migration environment error;
- `4`: bounded indexing/sync source or transaction error;
- `6`: unexpected internal failure.

## `start [path]`

Starts the loopback service and built dashboard for one fixed repository:

```bash
gatekeeper start .
```

The command prints the canonical repository root and random `127.0.0.1` URL, remains in the foreground, and stops on Ctrl+C. The dashboard Overview, Review Inspector, stored-review routes, and Project Memory search use the same repository for the service lifetime. Completed reviews and bounded indexes remain available after restart in machine-local Project Memory.

## Deterministic demo fixtures

Generate the four disposable Git repositories, then run the acceptance matrix:

```bash
pnpm fixtures:prepare
gatekeeper policy validate demo/fixtures/clean
gatekeeper review worktree demo/fixtures/clean
gatekeeper review worktree demo/fixtures/missing-test
gatekeeper review worktree demo/fixtures/protected-path --format json
gatekeeper repo init demo/fixtures/history
gatekeeper index demo/fixtures/history
gatekeeper index demo/fixtures/history
gatekeeper memory search "redis cache" demo/fixtures/history --format json
gatekeeper review worktree demo/fixtures/history --format json
```

The first three review verdicts are `FAST_PATH`, `REQUIRE_CHANGES`, and `BLOCK`. The history fixture contains a reverted required-Redis proposal, its active ADR, ignored and denied content, and a source change with its required test. Its second index writes zero records, Redis search returns ADR and commit evidence, and its worktree review is `FAST_PATH`. Re-running `pnpm fixtures:prepare` replaces only the generated fixture directories and produces the same states.

The Phase 5 Ghost Change is also exported as a raw GitHub-response fixture. Its offline integration test exercises provider parsing, partial malformed-record survival, ordered linked history, passing checks, inert hostile prose, completion, and persisted `ESCALATE` output:

```bash
pnpm vitest run --config vitest.workspace.ts demo/ghost-change.test.ts
pnpm demo:seed -- --repo owner/gatekeeper-demo-repo --dry-run
```

The optional seeder defaults to zero-request dry-run. Its separately authorized `--apply` path requires one exact dedicated repository and three prepared branches; see [demo-seeding.md](../development/demo-seeding.md).
