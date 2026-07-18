# CLI reference

Build the workspace, then run the source CLI through pnpm:

```bash
pnpm build
pnpm --filter @gatekeeper/cli start -- <command>
```

The compiled equivalent is `node apps/cli/dist/index.js <command>`.

## `doctor`

Checks Node, pnpm, Git, optional `gh`, and the writable app-data path without authenticating or making a network request.

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

`human` is the default format. It prints the verdict, summary, counts, finding authority/severity, affected paths, and remediation. `json` emits the strict ReviewRun v1 contract documented in [verdicts.md](verdicts.md).

The review loads `.gatekeeper/policies.yaml` when present and otherwise uses an empty version-1 policy. It never accepts a base branch, remote, URL, pull request, arbitrary file, or policy text through the command line.

### Exit behavior

For `policy validate` and `review worktree`:

- `0`: validation or review completed, including `REQUIRE_CHANGES`, `ESCALATE`, or `BLOCK`;
- `2`: policy/configuration error;
- `3`: repository, Git, or bounded-worktree environment error;
- `6`: unexpected internal review failure.

A verdict is product output, not a process failure. Phase 2 intentionally has no enforcement flag and never mutates the target repository.

## `start [path]`

Starts the loopback service and built dashboard for one fixed repository:

```bash
gatekeeper start .
```

The command prints the canonical repository root and random `127.0.0.1` URL, remains in the foreground, and stops on Ctrl+C. The dashboard Overview and Review Inspector use the same repository for the service lifetime. No review is persisted.

## Deterministic demo fixtures

Generate the three disposable Git repositories, then run the acceptance matrix:

```bash
pnpm fixtures:prepare
gatekeeper policy validate demo/fixtures/clean
gatekeeper review worktree demo/fixtures/clean
gatekeeper review worktree demo/fixtures/missing-test
gatekeeper review worktree demo/fixtures/protected-path --format json
```

Expected verdicts are `FAST_PATH`, `REQUIRE_CHANGES`, and `BLOCK` respectively. Re-running `pnpm fixtures:prepare` replaces only the generated fixture directories and produces the same states.
