# Gatekeeper — Phase Prompts for Codex

Use only after the previous phase has passed its acceptance gate.

## Phase 0

> Read `GATEKEEPER_MASTER_BUILD_PROMPT.md`, `ARCHITECTURE_AND_STACK.md`, `PHASED_EXECUTION_PLAN.md`, and all existing repository instructions. Execute Phase 0 only. First inspect the repository and propose the smallest coherent Phase 0 plan. Then implement it, run all acceptance commands, update documentation and `docs/progress.md`, and return the required phase completion report. Do not begin Phase 1 or add placeholder implementations for later phases.

## Phase 1

> Continue Gatekeeper by executing Phase 1 only. Read the master specification, Phase 1 acceptance criteria, ADRs, and `docs/progress.md`. Verify Phase 0 is complete before editing. Build the deterministic local review engine and CLI without SQLite, MCP, GitHub network calls, or model calls. Add fixture Git repositories and tests. Run the complete Phase 1 acceptance suite, update documentation and progress, report actual command results, and stop before Phase 2.

## Phase 2

> Execute Gatekeeper Phase 2 only. Preserve the existing domain boundaries. Add SQLite Project Memory v1, migrations, repository registration, incremental indexing, FTS5 search, and app-data storage. Do not add MCP or GitHub synchronization. Prove first-index and incremental-index behavior with tests and perform a read-only pilot against the local `posappv4` checkout. Update storage/security documentation and `docs/progress.md`, then stop.

## Phase 3

> Execute Gatekeeper Phase 3 only. Add the localhost Fastify daemon, daemon lifecycle, job progress, stdio MCP server, project Codex configuration, and Gatekeeper Codex skill. Keep MCP thin and durable state in the daemon/SQLite. Make interactive Codex review work against a local fixture repository. Add protocol, API, prompt-injection, and approval-gate tests. Do not add GitHub remote synchronization. Update all references and stop after the phase report.

## Phase 4

> Execute Gatekeeper Phase 4 only. Add a read-only GitHub provider using the authenticated `gh` CLI, with injectable process execution and fixture responses. Support repository remote detection, incremental issue/PR/comment synchronization, and `review pr`. Store no personal access token and perform no GitHub write. Test on the seeded demo repository and use `posappv4` only where its available history is useful. Update docs/progress and stop before architecture reasoning.

## Phase 5

> Execute Gatekeeper Phase 5 only. Add JS/TS and Vue analyzers, dependency/symbol graph, blast-radius traversal, historical similarity, revert/supersession evidence, intent-versus-change analysis, and optional GPT-5.6 headless reasoning with strict output. Keep enforcement deterministic; inference cannot create `BLOCK`. Build golden scenarios and demonstrate the Redis-history, architecture-boundary, auth-risk, and mega-PR cases. Update docs/evals/progress and stop.

## Phase 6

> Execute Gatekeeper Phase 6 only. Add explicit project decisions with lifecycle states and approval-gated write tools, then the local dashboard. Preserve localhost-only security and shared contracts. Add auditability and E2E tests. Update docs/progress and stop before GitHub publication.

## Phase 7

> Execute Gatekeeper Phase 7 only. Add an optional GitHub Actions integration and publication adapter with dry-run default, least privilege, fork-safety, idempotent comments/checks, and explicit configuration. Never auto-close PRs. Model inference must not hard-fail CI unless an explicit policy maps it. Update security/deployment docs and stop.

## Phase 8

> Execute Gatekeeper Phase 8 only. Package the CLI, daemon, MCP server, skill/plugin bundle, demo seeder, eval corpus, diagnostics, and release workflow. Test installation and removal on a clean environment. Produce the reproducible hackathon demo guide and final architecture/security documentation.
