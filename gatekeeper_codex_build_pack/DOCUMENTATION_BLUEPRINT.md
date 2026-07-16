# Gatekeeper — Documentation Blueprint

Documentation is part of each feature’s definition of done.

## Required tree

```text
README.md
AGENTS.md
CONTRIBUTING.md
SECURITY.md
CHANGELOG.md
LICENSE

docs/
├─ product/
│  ├─ vision.md
│  ├─ users-and-workflows.md
│  ├─ non-goals.md
│  └─ terminology.md
├─ architecture/
│  ├─ overview.md
│  ├─ data-flow.md
│  ├─ package-boundaries.md
│  ├─ storage.md
│  ├─ indexing.md
│  ├─ retrieval.md
│  ├─ review-pipeline.md
│  ├─ codex-integration.md
│  ├─ github-integration.md
│  ├─ security.md
│  └─ adr/
│     ├─ 0001-local-first.md
│     ├─ 0002-sqlite-storage.md
│     ├─ 0003-codex-skill-and-mcp.md
│     ├─ 0004-gh-cli-first.md
│     ├─ 0005-evidence-first-verdicts.md
│     ├─ 0006-no-ai-authorship-detection.md
│     ├─ 0007-read-only-default.md
│     └─ 0008-external-app-data-storage.md
├─ guides/
│  ├─ installation.md
│  ├─ quickstart.md
│  ├─ codex-setup.md
│  ├─ repository-setup.md
│  ├─ posappv4-pilot.md
│  ├─ demo-repository.md
│  ├─ privacy-modes.md
│  └─ troubleshooting.md
├─ reference/
│  ├─ cli.md
│  ├─ daemon-api.md
│  ├─ mcp-tools.md
│  ├─ configuration.md
│  ├─ policy-schema.md
│  ├─ verdict-schema.md
│  ├─ storage-schema.md
│  ├─ exit-codes.md
│  └─ environment-variables.md
├─ development/
│  ├─ setup.md
│  ├─ testing.md
│  ├─ fixtures-and-evals.md
│  ├─ migrations.md
│  ├─ adding-language-analyzers.md
│  ├─ adding-providers.md
│  ├─ releasing.md
│  └─ demo-seeding.md
├─ threat-model.md
├─ roadmap.md
└─ progress.md
```

## README responsibilities

README should explain:

- problem;
- product distinction;
- local-first architecture;
- quick start;
- Codex workflow;
- privacy;
- current maturity;
- links to deeper docs.

Do not let README become the full technical specification.

## `AGENTS.md`

Repository instructions for Codex and other coding agents:

- phase gates;
- commands;
- package boundaries;
- documentation obligations;
- security rules;
- generated-file rules;
- no network in default tests;
- no next-phase work;
- completion report.

## ADR format

Each ADR includes:

```text
Title
Status
Date
Context
Decision
Alternatives considered
Consequences
Security/privacy impact
Migration/revisit trigger
```

Do not edit old accepted ADR meaning silently. Supersede it with a new ADR.

## Reference docs

Reference docs must be generated from or tested against code where practical.

Examples:

- CLI snapshots;
- Zod/JSON Schema examples;
- OpenAPI output;
- MCP tool contract tests;
- migration schema diagrams.

## Progress document

`docs/progress.md` should contain:

```text
Current phase
Last completed phase
Current branch/commit
Implemented capabilities
Acceptance commands and latest results
Known limitations
Open decisions
Deferred work
Next phase entry conditions
```

Update it at every phase boundary.

## Security documentation

`SECURITY.md`:

- vulnerability-reporting instructions;
- supported versions;
- local-data location;
- secret handling;
- GitHub token model;
- model data-flow summary.

`docs/threat-model.md`:

- assets;
- trust boundaries;
- actors;
- threats;
- mitigations;
- residual risks;
- review date.

Explicitly cover:

- prompt injection;
- malicious repositories;
- symlink/path traversal;
- subprocess injection;
- secret exfiltration;
- poisoned issue/PR history;
- unsafe GitHub writes;
- local daemon exposure;
- stale/superseded decisions.

## Documentation ownership by phase

### Phase 0

Create the full skeleton and substantive:

- vision;
- non-goals;
- architecture overview;
- package boundaries;
- initial ADRs;
- development setup;
- progress.

### Phase 1

Add:

- CLI;
- policies;
- verdict;
- review pipeline;
- exit codes.

### Phase 2

Add:

- storage;
- indexing;
- migrations;
- privacy modes.

### Phase 3

Add:

- daemon API;
- MCP tools;
- Codex setup;
- local service troubleshooting.

### Phase 4

Add:

- GitHub integration;
- authentication;
- remote sync.

### Phase 5

Add:

- retrieval;
- graph;
- reasoning;
- evals.

### Phase 6

Add:

- dashboard;
- decision lifecycle.

### Phase 7

Add:

- GitHub Action;
- publication security.

### Phase 8

Finalize:

- install/release;
- demo;
- performance;
- compatibility;
- plugin distribution.
