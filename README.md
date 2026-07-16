# Gatekeeper

> The code was correct. The decision was wrong. Gatekeeper knew the difference and showed the evidence.

Gatekeeper is a local-first repository intelligence and governance agent for Codex. It is designed to help Codex judge whether a change belongs in a project—not only whether the changed code is locally correct—by combining deterministic policy with durable, traceable project memory.

## Current status

Phases 0 and 1 are complete. Gatekeeper now provides strict local-service contracts, safe Git repository inspection, the bearer-authenticated Fastify service, the real React dashboard, and the foreground `gatekeeper start` lifecycle. Diff review, persistent storage, MCP, GitHub data, and model reasoning remain behind later phase gates.

## Quick start

Requirements: Node.js 24 LTS and pnpm 11.

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @gatekeeper/cli start -- --help
pnpm --filter @gatekeeper/cli start -- doctor --format json
pnpm --filter @gatekeeper/cli start -- start .
```

`gh` remains optional in Phase 1. Doctor reports its absence as a warning and does not authenticate or make network calls.

`gatekeeper start` runs in the foreground and prints the random loopback dashboard URL. Stop it with Ctrl+C; it does not install a service or background process.

## Foundation

- `packages/domain`: pure IDs, review entities, and deterministic verdict rules.
- `packages/contracts`: strict Zod contracts and generated JSON Schema.
- `packages/config`: policy parsing and app-data path resolution.
- `packages/git-adapter`: safe repository-root discovery and truthful Git status.
- `packages/testkit`: deterministic fixtures shared by tests.
- `apps/cli`: version/help, offline Doctor, and the foreground `start [path]` lifecycle.
- `apps/server`: loopback-only Fastify service, secure bootstrap, health, and status APIs.
- `apps/dashboard`: authenticated React/Vite repository overview with explicit loading, empty, and error states.

The canonical verdict JSON Schema is [schemas/verdict.schema.json](schemas/verdict.schema.json), generated from the Zod contract and checked for drift by tests. The canonical policy example is [gatekeeper.policy.example.yaml](gatekeeper.policy.example.yaml).

## Project documents

- [Architecture overview](docs/architecture/overview.md)
- [Architecture decisions](docs/architecture/decisions.md)
- [Security model](docs/security/overview.md)
- [Verdict reference](docs/reference/verdicts.md)
- [Policy reference](docs/reference/policy.md)
- [Local API reference](docs/reference/local-api.md)
- [Development setup](docs/development/setup.md)
- [Build progress](docs/progress.md)
- [Build Week execution plan](gatekeeper_codex_build_pack/GATEKEEPER_HACKATHON_PHASED_EXECUTION_PLAN.md)

The complete specification is the long-term product authority. The Build Week plan controls the hackathon execution order and stop gates.

## Privacy and trust

Gatekeeper is local-first, read-only by default, and treats repository/GitHub content as untrusted data. Model inference can never produce `BLOCK`; that verdict requires a hard deterministic policy finding. See [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
