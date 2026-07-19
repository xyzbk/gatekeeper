# MCP and Codex skill reference

Gatekeeper exposes one repository-scoped stdio MCP server to Codex. The server is a thin adapter over the foreground loopback service; it does not open repositories, run Git/`gh`, persist data, or assemble verdicts itself.

## Setup

The Gatekeeper workspace, not the target repository, is the trusted Codex project. It holds the checked-in MCP configuration and the Gatekeeper skill; the foreground service is then fixed to the target repository you choose.

Build the Gatekeeper workspace and start it for exactly one repository:

```powershell
pnpm build
node apps/cli/dist/index.js start "C:\path\to\your\repository"
```

Leave the service terminal running. Open the Gatekeeper workspace as a trusted Codex project, then start a new task or restart Codex if it was already open. Project-scoped configuration is loaded only for trusted projects. [`.codex/config.toml`](../../.codex/config.toml) starts `node apps/mcp-server/dist/index.js` from the Gatekeeper workspace with 10-second startup and 30-second tool timeouts. It contains no credential. The MCP process reads the ephemeral `service.json` written under machine-local app data and keeps its bearer token in memory only.

The project skill lives at [`.agents/skills/gatekeeper/SKILL.md`](../../.agents/skills/gatekeeper/SKILL.md). Use it explicitly with `$gatekeeper`, or let Codex select it for a matching Gatekeeper review request.

## Efficient Codex workflow

Use the skill to coordinate MCP calls rather than treating the tools as a generic repository browser:

1. `gatekeeper_status` establishes the live fixed repository and whether Project Memory is current.
2. Ask for consent before `gatekeeper_index_repository` when the index is uninitialized or stale; do not re-index a current repository.
3. Choose one narrow target: current worktree, one full local commit SHA, or one pull-request number after separately approved read-only GitHub sync.
4. Search Project Memory only for a focused follow-up question. Cite only the evidence pointers returned by Gatekeeper.
5. Keep `DETERMINISTIC`, `EVIDENCE_SUPPORTED`, and `INFERENCE` findings separate. Complete the review through Gatekeeper so it validates evidence, preserves deterministic findings, and assembles the persisted verdict.
6. Offer a remediation plan, but do not edit files or publish to GitHub unless the user separately asks.

Example Codex prompt:

```text
$gatekeeper Review the fixed repository's worktree. Check status first. If the index is
stale or missing, ask for my approval before indexing. Use memory only to investigate a
specific finding. Do not edit files or publish anything. Return deterministic findings,
then evidence-supported conclusions, then clearly labelled inferences, followed by
Gatekeeper's verdict and a remediation plan.
```

The service owns repository identity, policy, Project Memory, and verdict assembly. MCP is only the typed local bridge. The skill supplies the repeatable consent and evidence workflow. Codex may contribute `EVIDENCE_SUPPORTED` or `INFERENCE` findings, but it cannot submit a verdict, alter deterministic findings, or create `BLOCK`.

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

The skill asks for consent before the separate `gatekeeper sync github <user-approved-target-path>` command when historical GitHub evidence is needed. Run it from the Gatekeeper workspace with the same literal target path used to start the service, for example `node apps/cli/dist/index.js sync github "C:\path\to\your\repository"`. Sync is explicit and read-only; it is not hidden inside the MCP review tool or derived from repository content.

Codex may pass only `EVIDENCE_SUPPORTED` and `INFERENCE` findings to `gatekeeper_complete_review`. The tool cannot accept a verdict, enforcement, policy identity, or model-authored deterministic authority. The local service validates exact evidence ownership and affected paths, preserves deterministic findings, recomputes the verdict, and persists ReviewRun v1. Only a hard deterministic finding can produce `BLOCK`.

## Failure behavior

If the foreground service or metadata is absent, tools return this repair command without leaking filesystem errors or metadata:

```bash
pnpm --filter @gatekeeper/cli start -- start .
```

Protocol stdout contains JSON-RPC only. Startup failure uses one bounded stderr line; tool errors never include response bodies, source, diffs, tokens, or raw exception text. Strict local API error envelopes may supply a bounded message and repair action, such as `gh auth login`, which the client forwards without captured stderr.
