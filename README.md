# Gatekeeper

> The code was correct. The decision was wrong. Gatekeeper knew the difference and showed the evidence.

Gatekeeper is a local-first repository intelligence and governance agent for Codex. It is designed to help Codex judge whether a change belongs in a project—not only whether the changed code is locally correct—by combining deterministic policy with durable, traceable project memory.

## Current status

Phases 0 through 2 are complete. Gatekeeper now turns staged, unstaged, and untracked worktree changes into a strict deterministic ReviewRun through the CLI, bearer-authenticated local API, and React Review Inspector. Persistent storage, Project Memory, MCP, GitHub data, and model reasoning remain behind later phase gates.

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
pnpm --filter @gatekeeper/cli start -- start .
```

`review worktree` loads `.gatekeeper/policies.yaml` when present and otherwise uses an empty version-1 policy. `policy validate` intentionally requires the file. A completed review exits successfully even when its verdict is `BLOCK`; Phase 2 reports decisions but does not enforce repository mutation.

`gh` remains optional in Phase 2. Doctor reports its absence as a warning and does not authenticate or make network calls.

`gatekeeper start` runs in the foreground and prints the random loopback dashboard URL. Open Reviews to run the same deterministic worktree review through the local API. Stop the process with Ctrl+C; it does not install a service, persist a review, or run in the background.

## Foundation

- `packages/domain`: pure IDs, review entities, and deterministic verdict rules.
- `packages/contracts`: strict Zod contracts and generated JSON Schema.
- `packages/config`: policy parsing and app-data path resolution.
- `packages/git-adapter`: safe repository discovery plus bounded staged, unstaged, and untracked change extraction.
- `packages/review-engine`: pure metrics, five deterministic policy checks, and verdict assembly.
- `packages/testkit`: deterministic fixtures shared by tests.
- `apps/cli`: offline Doctor, policy validation, worktree review, and the foreground `start [path]` lifecycle.
- `apps/server`: loopback-only Fastify service with secure bootstrap, status, and worktree-review APIs.
- `apps/dashboard`: authenticated React/Vite repository overview and accessible Review Inspector.

The canonical verdict JSON Schema is [schemas/verdict.schema.json](schemas/verdict.schema.json), generated from the Zod contract and checked for drift by tests. The canonical policy example is [gatekeeper.policy.example.yaml](gatekeeper.policy.example.yaml).

## Project documents

- [Architecture overview](docs/architecture/overview.md)
- [Review pipeline](docs/architecture/review-pipeline.md)
- [Architecture decisions](docs/architecture/decisions.md)
- [Security model](docs/security/overview.md)
- [Verdict reference](docs/reference/verdicts.md)
- [Policy reference](docs/reference/policy.md)
- [Local API reference](docs/reference/local-api.md)
- [CLI reference](docs/reference/cli.md)
- [Development setup](docs/development/setup.md)
- [Build progress](docs/progress.md)
- [Build Week execution plan](gatekeeper_codex_build_pack/GATEKEEPER_HACKATHON_PHASED_EXECUTION_PLAN.md)

The complete specification is the long-term product authority. The Build Week plan controls the hackathon execution order and stop gates.

## Privacy and trust

Gatekeeper is local-first, read-only by default, and treats repository/GitHub content as untrusted data. Phase 2 runs no model and performs no network request. Raw source and diff lines stay inside the bounded Git/review boundary; CLI, API, dashboard, and logs receive only findings, counts, paths, and remediation. `BLOCK` requires a hard deterministic policy finding. See [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
