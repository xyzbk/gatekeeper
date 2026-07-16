# Gatekeeper — Phased Execution Plan

## Why phases are mandatory

A single all-at-once Codex run would combine:

- monorepo setup;
- persistence;
- indexing;
- Git subprocess behavior;
- GitHub authentication;
- MCP protocol;
- local-service lifecycle;
- model reasoning;
- security;
- a dashboard;
- a demo.

That would make failures hard to isolate and produce an impressive-looking but unreliable system.

Each phase below has a usable deliverable and a stop gate.

---

# Phase 0 — Foundation and contracts

## Goal

Create a clean, documented, testable foundation with no fake implementation.

## Build

- root workspace;
- Node/TypeScript/pnpm/Turbo configuration;
- initial package boundaries;
- shared domain identifiers and review contracts;
- strict verdict JSON Schema;
- policy configuration schema v1;
- lint/typecheck/test/build commands;
- CI workflow;
- documentation tree;
- ADRs;
- `AGENTS.md`;
- `docs/progress.md`;
- testkit basics.

## Suggested initial packages

```text
packages/domain
packages/contracts
packages/config
packages/testkit
apps/cli
```

The CLI may expose only `gatekeeper --version` and `gatekeeper doctor` with environment checks.

Do not create empty daemon, MCP, DB, and dashboard packages unless required by a tested contract.

## Acceptance

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @gatekeeper/cli start -- --help
```

- policy example validates;
- verdict schema validates fixtures;
- dependency boundaries are clear;
- docs describe Phase 1 entry.

## Stop

No Git diff review, SQLite, daemon, MCP, GitHub, or model call.

---

# Phase 1 — Deterministic local review engine

## Goal

Review local changes without AI or persistent memory.

## Build

- `GitProvider`;
- local Git adapter using `execa`;
- registered/explicit repository path resolution;
- worktree, staged, branch, and commit-range change extraction;
- diff metrics;
- policy evaluator v1;
- verdict assembler;
- human and JSON CLI output;
- safe ignore/path handling;
- temporary Git-repository tests.

## Commands

```text
gatekeeper review worktree
gatekeeper review staged
gatekeeper review branch --base master
gatekeeper review range master..HEAD
gatekeeper policy validate
```

## Deterministic policies

- maximum files/lines;
- required tests for path changes;
- required docs for public API paths;
- risk zones;
- forbidden imports using simple configured patterns;
- ignored/generated paths;
- protected paths;
- required branch/base metadata where locally available.

## Acceptance

- all commands work in fixture repositories;
- JSON matches `verdict.schema.json`;
- no shell interpolation;
- paths cannot escape repository;
- a sample clean change produces `FAST_PATH`;
- missing tests produces `REQUIRE_CHANGES`;
- hard protected-path rule produces `BLOCK`;
- no network or OpenAI key is required.

## Pilot

Run read-only against a clone of `posappv4` for:

- worktree review;
- selected commit ranges;
- path/test heuristics.

## Stop

No SQLite and no semantic/historical reasoning.

---

# Phase 2 — SQLite Project Memory v1

## Goal

Persist repository facts and index Git history incrementally.

## Build

- OS application-data layout;
- SQLite adapter;
- Drizzle schema and migrations;
- repository registration;
- initial and incremental indexing jobs;
- file metadata/hashes;
- commits;
- docs and ADR discovery;
- bounded document chunks;
- FTS5;
- memory search CLI;
- index status;
- derived-summary boundary with fake/no-op provider;
- migration and crash/retry tests.

## Commands

```text
gatekeeper repo init
gatekeeper repo status
gatekeeper index
gatekeeper memory search
```

## Acceptance

- first index works;
- second unchanged index is incremental;
- changed file invalidates only affected records;
- FTS search returns evidence pointers;
- database is outside target repo;
- ignored/secret files are not indexed;
- migration rollback/recovery behavior is documented;
- `posappv4` can be indexed locally without modifying it.

## Stop

No MCP or GitHub remote sync.

---

# Phase 3 — Local daemon, MCP, and Codex integration

## Goal

Make Gatekeeper a native Codex assistant.

## Build

- Fastify daemon;
- local token;
- health/status/repository/index/review/search endpoints;
- job tracking and SSE progress;
- daemon lifecycle CLI;
- official MCP stdio server;
- shared contracts between daemon and MCP;
- `.codex/config.toml` example;
- `.agents/skills/gatekeeper/SKILL.md`;
- skill references;
- Codex setup guide;
- MCP contract tests;
- optional `ReasoningProvider` interface and fake provider;
- strict review context returned for Codex reasoning.

## Interactive behavior

A user can ask:

> Review my current branch with Gatekeeper.

Codex should:

1. call status;
2. index if needed;
3. call branch/worktree review;
4. search relevant memory;
5. explain evidence;
6. suggest remediation;
7. not change files unless requested.

## Acceptance

- Codex lists the Gatekeeper tools;
- a tool call reaches the daemon;
- daemon can be restarted without losing state;
- MCP process has no durable database of its own;
- interactive review works in a fixture repo;
- prompt injection text in a file is returned only as untrusted evidence;
- no write tool executes without approval.

## Stop

No GitHub remote data yet.

---

# Phase 4 — GitHub read-only integration

## Goal

Review real GitHub pull requests and synchronize historical discussions using existing user authentication.

## Build

- `GitHubProvider`;
- `gh` adapter;
- `gh auth status` preflight;
- remote detection;
- PR metadata and diff retrieval;
- issues and PR sync;
- comments/reviews normalization;
- sync cursors;
- GitHub evidence pointers;
- PR review CLI/MCP tool;
- offline cached behavior;
- rate-limit and partial-failure handling;
- fake `gh` integration tests.

## Commands/tools

```text
gatekeeper sync github
gatekeeper review pr 123
gatekeeper_review_pull_request
gatekeeper_sync_github
```

## Acceptance

- no PAT is stored by Gatekeeper;
- missing `gh` auth has an actionable error;
- a PR can be reviewed read-only;
- issue/PR content is treated as untrusted;
- no GitHub comment, label, close, or status is created;
- repeat sync is incremental;
- demo repository history is searchable.

## Pilot note

Use `posappv4` for repository/commit analysis, but use the demo repository for rich issue/PR history.

## Stop

No publishing or auto-rejection.

---

# Phase 5 — Architecture graph and historical reasoning

## Goal

Deliver the “this project remembers why” experience.

## Build

- JS/TS analyzer;
- Vue SFC analyzer;
- import/export/symbol graph;
- module boundaries;
- changed-symbol mapping;
- blast-radius traversal;
- hotspot metrics;
- intent extraction contract;
- similar-change retrieval;
- revert and supersession detection;
- architecture-rule evidence;
- optional GPT-5.6 reasoning provider with strict structured output;
- explicit evidence/inference separation;
- suggested PR splitting.

## Acceptance

- direct and indirect dependencies are distinguishable;
- parse failures are non-fatal;
- a known architecture bypass is detected;
- a revived reverted design retrieves the correct history;
- uncertain historical matches cannot cause `BLOCK`;
- headless reasoning can be disabled;
- deterministic test suite uses a fake provider;
- `posappv4` Vue/CommonJS paths are handled at a useful baseline.

## Demo outcomes

- Redis revival references ADR/revert;
- route-to-database bypass references architecture rule;
- auth change escalates;
- broad PR receives a split proposal.

---

# Phase 6 — Decisions and local dashboard

## Goal

Turn review history into explicit, governable project memory.

## Build

- record/supersede/dispute/expire decisions;
- approval-gated write tools;
- decision evidence;
- local dashboard;
- indexing/review status;
- review details;
- search;
- decision timeline;
- policy editor with validation preview;
- audit log.

## Acceptance

- write tools require approval;
- decision changes are auditable;
- stale/superseded decisions are not enforced as active;
- UI has no direct DB access;
- dashboard E2E tests pass;
- local service remains localhost-only.

---

# Phase 7 — Optional GitHub Action and publication

## Goal

Run Gatekeeper in CI without creating a hosted service.

## Build

- reusable GitHub Action workflow;
- Gatekeeper CLI headless mode;
- strict JSON output;
- optional GitHub check/comment publisher;
- least-privilege permissions;
- dry-run default;
- publication preview;
- idempotency marker;
- prompt-injection hardening;
- fork/secret safety documentation.

## Acceptance

- fork PRs cannot access protected secrets incorrectly;
- read-only analysis works;
- publication requires explicit repository configuration;
- repeated run updates rather than spams;
- no automatic PR close;
- model inference cannot make the workflow hard-fail unless policy explicitly maps it.

---

# Phase 8 — Packaging, evals, and demo polish

## Goal

Make the project distributable and hackathon-ready.

## Build

- npm packages/binaries;
- installer and uninstaller;
- shareable Codex plugin bundle;
- versioned migration/update path;
- eval corpus;
- diagnostics bundle;
- performance benchmarks;
- demo-repo seeder;
- reproducible demo script;
- release docs;
- security threat model;
- contributor guide.

## Acceptance

- clean-machine install test;
- uninstall leaves target repos untouched;
- plugin/skill activation works;
- demo can be reset deterministically;
- eval and benchmark reports generated;
- final walkthrough documented.
