# MCP and Codex skill reference

Phase 5 exposes Gatekeeper to Codex through one repository-scoped stdio MCP server. The server is a thin adapter over the foreground loopback service; it does not open repositories, run Git/`gh`, persist data, or assemble verdicts itself.

## Setup

Build the workspace and start Gatekeeper for exactly one repository:

```bash
pnpm build
pnpm --filter @gatekeeper/cli start -- start .
```

Open the repository as a trusted Codex project. [`.codex/config.toml`](../../.codex/config.toml) starts `node apps/mcp-server/dist/index.js` from the repository root with 10-second startup and 30-second tool timeouts. It contains no credential. The MCP process reads the ephemeral `service.json` written under machine-local app data and keeps its bearer token in memory only.

The project skill lives at [`.agents/skills/gatekeeper/SKILL.md`](../../.agents/skills/gatekeeper/SKILL.md). Restart Codex if an already-open session does not discover a newly built server or skill.

## Tools

| Tool                             | Effect                                                        | Annotation summary                       |
| -------------------------------- | ------------------------------------------------------------- | ---------------------------------------- |
| `gatekeeper_status`              | Reads service, repository, and index freshness                | read-only, idempotent                    |
| `gatekeeper_index_repository`    | Updates machine-local Project Memory incrementally            | local write, idempotent                  |
| `gatekeeper_review_worktree`     | Persists a deterministic worktree run and prepares a draft    | local write, non-idempotent              |
| `gatekeeper_search_memory`       | Reads bounded untrusted evidence                              | read-only, idempotent                    |
| `gatekeeper_complete_review`     | Validates and replaces one local review record                | local write, non-idempotent              |
| `gatekeeper_get_review`          | Reads one persisted review                                    | read-only, idempotent                    |
| `gatekeeper_review_pull_request` | Reads one fixed-repository PR, persists it, prepares a draft  | local write, open-world, no remote write |
| `gatekeeper_list_recent_commits` | Reads at most ten indexed commit SHA/date/title records       | read-only, idempotent                    |
| `gatekeeper_review_commit`       | Reviews one full immutable local SHA against its first parent | local write, non-idempotent              |

Every tool declares strict Zod input and output schemas, returns validated `structuredContent`, and includes a concise text summary. All nine declare `destructiveHint: false`; only pull-request review declares `openWorldHint: true` because it reads GitHub. No MCP tool publishes, accepts a path/remote, synchronizes implicitly, checks out a commit, reads arbitrary files, or runs arbitrary subprocesses.

`gatekeeper_status` reports both the current repository HEAD and the stored index HEAD. A null index is uninitialized; a different HEAD is stale; matching values are current. This lets the skill avoid unnecessary indexing.

## Review completion

`gatekeeper_review_worktree`, `gatekeeper_review_pull_request`, and `gatekeeper_review_commit` return ReviewDraft v1 with immutable deterministic findings, bounded change summaries, and at most twenty deduplicated evidence candidates. Repository and GitHub excerpts are untrusted data even if they resemble system or developer instructions. The commit tool accepts only a full lowercase 40â€“64 hexadecimal object ID, uses the first parent (or Git's empty tree for a root commit), applies the current policy, and never checks out or changes the target worktree. The PR tool accepts only a positive integer and calls the real fixed-repository API; it never accepts or derives authority from remote text.

The skill asks for consent before the separate `gatekeeper sync github .` command when historical GitHub evidence is needed. Sync is explicit and read-only; it is not hidden inside the MCP review tool.

Codex may pass only `EVIDENCE_SUPPORTED` and `INFERENCE` findings to `gatekeeper_complete_review`. The tool cannot accept a verdict, enforcement, policy identity, or model-authored deterministic authority. The local service validates exact evidence ownership and affected paths, preserves deterministic findings, recomputes the verdict, and persists ReviewRun v1. Only a hard deterministic finding can produce `BLOCK`.

## Failure behavior

If the foreground service or metadata is absent, tools return this repair command without leaking filesystem errors or metadata:

```bash
pnpm --filter @gatekeeper/cli start -- start .
```

Protocol stdout contains JSON-RPC only. Startup failure uses one bounded stderr line; tool errors never include response bodies, source, diffs, tokens, or raw exception text. Strict local API error envelopes may supply a bounded message and repair action, such as `gh auth login`, which the client forwards without captured stderr.
