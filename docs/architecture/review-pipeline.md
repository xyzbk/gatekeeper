# Deterministic worktree review pipeline

Phase 2 has one review composition and three presentation surfaces. The CLI calls it directly; `gatekeeper start` injects it into the local API; the dashboard requests that API. Domain behavior remains outside all three adapters.

```text
requested path
  -> canonical repository snapshot
  -> repository policy (or version-1 default)
  -> bounded staged + unstaged + untracked ChangeSet
  -> pure deterministic policy evaluation
  -> domain verdict assembly
  -> strict ReviewRun v1 validation
  -> CLI human/JSON | local API | Review Inspector
```

## 1. Fix the repository boundary

The Git adapter asks Git for the top-level directory, canonicalizes it, and proves the requested path is inside it. Detached HEAD and missing origin remain explicit null states. Review composition uses the canonical root for every later read and for the opaque local repository ID.

## 2. Load policy safely

The loader reads only `.gatekeeper/policies.yaml` beneath that root. It rejects an escape through a link, a non-regular file, content over 256 KiB, invalid YAML, unknown fields, and schema errors. Direct review uses `{ version: 1 }` when no file exists; explicit policy validation requires the file.

## 3. Build a bounded ChangeSet

Tracked staged and unstaged changes are calculated together relative to `HEAD`. Untracked files come from Git's exclude-standard listing. Rename identity, additions, deletions, binary state, and capped added text lines are combined by canonical repository-relative path.

Hard bounds:

- 2 MiB per Git command result;
- 500 included changed paths;
- 1 MiB per untracked file;
- 500 inspected added lines per file;
- 2,000 characters per inspected added line;
- 64 KiB `.gatekeeperignore`.

The 500-path cap is checked before each included untracked file is read. A file that disappears or becomes unreadable during inspection returns a stable safe worktree error. Any unsafe or malformed path/result fails the review instead of producing partial policy claims. Hitting the per-file text bounds sets `contentTruncated`; a configured import-boundary source with incomplete text inspection escalates for human review.

## 4. Evaluate five deterministic checks

The review engine receives only a validated ChangeSet, validated policy, opaque IDs, and a timestamp. It sorts included paths and evaluates:

1. maximum changed files and total changed lines;
2. source-to-test change relationships;
3. configured risk-zone paths;
4. added relative imports crossing a denied boundary;
5. protected paths.

Findings are sorted by stable ID. Metrics count files, additions, deletions, production/test/documentation classifications, and first path-segment groups. No filesystem, Git, network, HTTP, browser, or model call occurs inside the engine.

## 5. Assemble and narrow the result

The domain verdict function applies the invariant order: deterministic hard finding becomes `BLOCK`; human approval or high/critical severity becomes `ESCALATE`; required enforcement becomes `REQUIRE_CHANGES`; otherwise the result is `FAST_PATH`.

Before leaving composition, Zod validates ReviewRun v1. The output carries bounded change summaries but not the internal `addedLines`. This is the narrow waist shared by the CLI, Fastify's generated draft-7 schema, the committed JSON Schema, and the React client.

## Failure boundary

- Policy problems are configuration failures.
- Repository, Git, unsafe-path, malformed-diff, or size-limit problems are environment failures.
- Unexpected failures become one stable internal error.
- API and dashboard errors never echo source, diff, YAML content, subprocess output, or bearer tokens.

## Deliberate Phase 2 limits

ReviewRun is ephemeral. There is no database, historical lookup, previous-review comparison, MCP transport, Codex skill, GitHub input, pull-request target, model judgment, or enforcement mutation. The policy parser accepts a few later-phase fields, but only the five checks above execute now.
