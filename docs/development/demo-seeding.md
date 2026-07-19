# Ghost Change demo seeding

The committed Ghost Change fixture is the authoritative, network-free Phase 5 demo. It drives the production GitHub provider, Project Memory normalization and relationship ranking, deterministic pull-request review, Codex draft preparation, completion, and SQLite persistence in automated tests.

Run the offline scenario:

```bash
pnpm vitest run --config vitest.workspace.ts demo/ghost-change.test.ts
```

## One-command local judge demo

Build once, then run the finite proof or open the foreground dashboard:

```bash
pnpm build
pnpm demo:smoke
pnpm eval
pnpm demo
```

`pnpm demo:smoke` exercises the six Golden Evaluation scenarios and exits with their exact verdicts. `pnpm eval` regenerates [the checked-in report](../release/golden-evaluation.md). `pnpm demo` starts a disposable local Git repository, the real loopback service, and the built dashboard with the committed Ghost fixture transport. It makes zero external network/model calls and never starts the live `gh` executable. Stop it with Ctrl+C; only its temporary demo root is removed.

## Optional GitHub metadata seeder

Preview the exact marked objects without installing `gh`, authenticating, or making a GitHub request:

```bash
pnpm demo:seed -- --repo owner/gatekeeper-demo-repo --dry-run
```

Dry-run is the default. `--apply` is deliberately separate and is not authorized by building or testing the script. Before applying, obtain explicit approval for the exact dedicated target, authenticate `gh`, and prepare these branches in that repository:

- `require-redis`
- `revert-required-redis`
- `revive-required-redis`

The apply path first confirms the exact `owner/repository`, verifies all three branch names, and discovers up to 99 existing issues and pull requests. It identifies only the six stable `gatekeeper-demo:ghost-change:*` body markers, substitutes their actual GitHub numbers into historical relationships, creates missing marked issues/PRs, and closes only the four marked historical objects whose fixture state is closed. It leaves the noise issue and revived PR open.

The seeder never creates or deletes branches, merges PRs, deletes content, edits unrelated objects, resets a repository, or runs through a shell. A rerun skips marked objects already in the expected state. An unexpectedly closed live object, duplicate/conflicting marker, incomplete branch preflight, over-bound discovery result, target mismatch, or malformed response stops the run with bounded output.

The source of truth is [demo/scenarios.json](../../demo/scenarios.json) plus [ghost-change.json](../../demo/fixtures/github/ghost-change.json). No `--apply` command is part of automated acceptance.
