# Gatekeeper

> The code was correct. The decision was wrong. Gatekeeper knew the difference and showed the evidence.

Gatekeeper is a local-first repository intelligence and governance agent for Codex. It is designed to help Codex judge whether a change belongs in a project—not only whether the changed code is locally correct—by combining deterministic policy with durable, traceable project memory.

## Current status

Phases 0 through 4 are complete. Gatekeeper turns staged, unstaged, and untracked worktree changes into a strict deterministic ReviewRun, persists reviews in local SQLite Project Memory, incrementally indexes bounded repository evidence, and exposes the same local system through the CLI, bearer-authenticated API, React dashboard, six-tool stdio MCP server, and repository Codex skill. GitHub data, pull-request review, publication, embeddings, and a second model provider remain behind later phase gates.

## Quick start

Requirements: Node.js 24 LTS and pnpm 11.

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm fixtures:prepare
pnpm --filter @gatekeeper/cli start -- --help
pnpm --filter @gatekeeper/cli start -- doctor --format json
pnpm --filter @gatekeeper/cli start -- policy validate demo/fixtures/clean
pnpm --filter @gatekeeper/cli start -- review worktree demo/fixtures/missing-test
pnpm --filter @gatekeeper/cli start -- review worktree demo/fixtures/protected-path --format json
pnpm --filter @gatekeeper/cli start -- repo init demo/fixtures/history
pnpm --filter @gatekeeper/cli start -- index demo/fixtures/history
pnpm --filter @gatekeeper/cli start -- memory search "redis cache" demo/fixtures/history
pnpm --filter @gatekeeper/cli start -- start .
```

`review worktree` loads `.gatekeeper/policies.yaml` when present and otherwise uses an empty version-1 policy. `policy validate` intentionally requires the file. A completed review exits successfully even when its verdict is `BLOCK`; Phase 2 reports decisions but does not enforce repository mutation.

`gh` remains optional in Phase 3. Doctor reports its absence as a warning and also verifies the native SQLite driver, app-data writability, WAL mode, and FTS5 without authenticating or making network calls.

`gatekeeper start` runs in the foreground and prints the random loopback dashboard URL. Open Reviews to run and persist the deterministic worktree review, or Memory to search bounded evidence. Stop the process with Ctrl+C; it does not install a service, mutate the repository, or run in the background.

After `pnpm build`, trusted Codex projects discover the local server through `.codex/config.toml` and the Gatekeeper workflow through `.agents/skills/gatekeeper`. Start the foreground service, then ask Codex: “Review my current worktree with Gatekeeper. Show deterministic findings first, then Project Memory evidence. Do not change files.” Gatekeeper—not Codex—validates completion and assembles the persisted verdict.

## Foundation

- `packages/domain`: pure IDs, review entities, and deterministic verdict rules.
- `packages/contracts`: strict Zod contracts and generated JSON Schema.
- `packages/config`: policy parsing and app-data path resolution.
- `packages/git-adapter`: safe repository discovery plus bounded staged, unstaged, and untracked change extraction.
- `packages/review-engine`: pure metrics, five deterministic policy checks, and verdict assembly.
- `packages/project-memory`: repository identity, bounded incremental indexing, and evidence retrieval orchestration.
- `packages/store-sqlite`: reviewed Drizzle schema, versioned migrations, WAL persistence, FTS5, and atomic review storage.
- `packages/testkit`: deterministic fixtures shared by tests.
- `apps/cli`: offline Doctor, policy validation, Project Memory commands, worktree review, and the foreground `start [path]` lifecycle.
- `apps/server`: loopback-only Fastify service with secure bootstrap and fixed-repository review/memory APIs.
- `apps/mcp-server`: protocol-clean stdio adapter exposing six strict fixed-repository tools to Codex.
- `apps/dashboard`: authenticated React/Vite repository overview, Review Inspector, persisted review routes, and Project Memory search.

The canonical verdict JSON Schema is [schemas/verdict.schema.json](schemas/verdict.schema.json), generated from the Zod contract and checked for drift by tests. The canonical policy example is [gatekeeper.policy.example.yaml](gatekeeper.policy.example.yaml).

## Project documents

- [Architecture overview](docs/architecture/overview.md)
- [Review pipeline](docs/architecture/review-pipeline.md)
- [Architecture decisions](docs/architecture/decisions.md)
- [Security model](docs/security/overview.md)
- [Verdict reference](docs/reference/verdicts.md)
- [Policy reference](docs/reference/policy.md)
- [Local API reference](docs/reference/local-api.md)
- [MCP and Codex skill reference](docs/reference/mcp.md)
- [CLI reference](docs/reference/cli.md)
- [Development setup](docs/development/setup.md)
- [Build progress](docs/progress.md)
- [Build Week execution plan](gatekeeper_codex_build_pack/GATEKEEPER_HACKATHON_PHASED_EXECUTION_PLAN.md)

The complete specification is the long-term product authority. The Build Week plan controls the hackathon execution order and stop gates.

## Privacy and trust

Gatekeeper is local-first, read-only by default, and treats repository/GitHub content as untrusted data. Phase 4 adds Codex reasoning over bounded evidence but no hosted model call, GitHub request, or publication path. It stores tracked metadata and hashes plus bounded selected documentation, policy, and commit evidence—not full private source files or raw diffs. CLI, API, dashboard, MCP, and logs receive only validated bounded records, and `BLOCK` still requires a hard deterministic policy finding. See [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
