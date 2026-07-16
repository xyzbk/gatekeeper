# Gatekeeper — Codex Build Pack

This pack is the implementation handoff for **Gatekeeper**, a local-first repository intelligence and pull-request governance agent that is deeply integrated with Codex.

## Recommended way to build it

Do **not** ask Codex to implement the whole product in one run.

Use the master specification as the permanent source of truth, then execute exactly one phase at a time:

1. Copy this pack into a new, separate `gatekeeper` repository.
2. Open the repository in Codex.
3. Give Codex `GATEKEEPER_MASTER_BUILD_PROMPT.md` and `GATEKEEPER_HACKATHON_PHASED_EXECUTION_PLAN.md`.
4. For OpenAI Build Week, tell Codex to use the hackathon plan as the execution order and execute **Phase 0 only**.
5. Run the acceptance checks yourself.
6. Continue with the matching prompt from `PHASE_PROMPTS.md`.

Every phase must end with:

- all relevant tests passing;
- documentation updated;
- `docs/progress.md` updated;
- a concise completion report;
- no work from the next phase started.

## Product shape

```text
Codex CLI / IDE / app
        |
        | discovers a Gatekeeper skill
        v
.agents/skills/gatekeeper/SKILL.md
        |
        | invokes local MCP tools over stdio
        v
Gatekeeper MCP server
        |
        | calls localhost API
        v
Gatekeeper daemon on 127.0.0.1
        |
        +-- Git adapter
        +-- GitHub `gh` adapter
        +-- indexer and language analyzers
        +-- deterministic policy engine
        +-- project-memory retrieval
        +-- review engine
        +-- optional headless reasoning provider
        |
        v
SQLite project memory
```

The CLI can also call the core directly, so Gatekeeper remains useful without Codex:

```text
gatekeeper init
gatekeeper index
gatekeeper review worktree
gatekeeper review range master..HEAD
gatekeeper review pr 123
gatekeeper memory search "authentication middleware"
```

## Important repository separation

Gatekeeper must live in its own repository.

`posappv4` is a **target repository used for read-only pilot testing**, not the place where Gatekeeper should be developed.

A second, purpose-built demo repository should contain curated issues, pull requests, ADRs, accepted changes, rejected ideas, reverts, and deliberately poor contributions. That repository provides repeatable evidence for the live hackathon demo.

## Files in this pack

For OpenAI Build Week, `GATEKEEPER_HACKATHON_PHASED_EXECUTION_PLAN.md` is the canonical execution order. The original phased plan remains the long-term production roadmap.

- `GATEKEEPER_HACKATHON_PHASED_EXECUTION_PLAN.md` — canonical Build Week scope, stack, phases, acceptance gates, and submission path.

- `GATEKEEPER_MASTER_BUILD_PROMPT.md` — the main prompt/specification to give Codex.
- `ARCHITECTURE_AND_STACK.md` — long-term stack and architectural decisions.
- `PHASED_EXECUTION_PLAN.md` — phase boundaries and acceptance gates.
- `PHASE_PROMPTS.md` — copy/paste continuation prompts for Codex.
- `POSAPPV4_PILOT_AND_DEMO_REPO.md` — testing strategy.
- `DOCUMENTATION_BLUEPRINT.md` — required documentation tree and ownership.
- `AGENTS.template.md` — repository-wide instructions for Codex.
- `gatekeeper.policy.example.yaml` — example repository policy.
- `verdict.schema.json` — initial strict review-result contract.

## Initial command to Codex

After placing these files in the new repository, use:

> Read `GATEKEEPER_MASTER_BUILD_PROMPT.md`, `GATEKEEPER_COMPLETE_CODEX_SPEC.md`, and `GATEKEEPER_HACKATHON_PHASED_EXECUTION_PLAN.md`. For OpenAI Build Week, treat the hackathon plan as the canonical execution order and the complete specification as the long-term product authority. Execute Phase 0 only. Do not begin Phase 1. Follow all phase exit criteria, update `docs/progress.md`, and report exactly what was created, tested, and deferred.
