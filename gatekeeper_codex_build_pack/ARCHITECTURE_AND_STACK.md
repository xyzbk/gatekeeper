# Gatekeeper — Architecture and Stack

## Executive recommendation

Build Gatekeeper **in phases**, not all at once.

The long-term architecture should have one reusable core with several adapters:

```text
Core domain and application services
├─ CLI adapter
├─ local daemon adapter
├─ MCP adapter for Codex
├─ Git adapter
├─ GitHub `gh` adapter
├─ SQLite adapter
├─ Codex/OpenAI reasoning adapter
├─ dashboard adapter
└─ GitHub Action adapter
```

This avoids two common failures:

1. making business logic inseparable from a GitHub bot;
2. making the product unusable without an AI model.

## Why Codex integration is a skill plus MCP

A Codex skill defines the workflow, safeguards, evidence rules, and presentation behavior.

The local MCP server provides executable tools.

The skill should not contain the whole product. It should orchestrate tools such as:

```text
gatekeeper_review_worktree
gatekeeper_review_pull_request
gatekeeper_search_memory
gatekeeper_find_similar_changes
gatekeeper_trace_blast_radius
gatekeeper_record_decision
```

The durable memory and indexing services remain in Gatekeeper’s daemon and SQLite database.

## Two reasoning modes

### Interactive mode

Codex is the reasoner.

Gatekeeper tools return:

- deterministic metrics;
- policy findings;
- relevant project history;
- graph results;
- evidence pointers;
- persisted review data.

Codex explains and acts on those findings.

This is the most natural hackathon experience and avoids paying for a second model call inside every tool.

### Headless mode

A CLI or GitHub Action cannot rely on a human-open Codex session. It uses a `ReasoningProvider`.

Implement:

```ts
interface ReasoningProvider {
  reason(input: ReasoningInput): Promise<ReasoningResult>;
}
```

Adapters:

- fake deterministic provider for tests;
- Codex SDK provider;
- optional Responses API provider;
- possible local-model provider later.

## Stack decision table

| Concern             | Choice                               | Why                                                                   |
| ------------------- | ------------------------------------ | --------------------------------------------------------------------- |
| Runtime             | Node.js 24 LTS                       | Current LTS line, mature ecosystem, strong cross-platform CLI support |
| Language            | TypeScript strict + ESM              | Contracts, refactoring safety, first-class SDK support                |
| Workspace           | pnpm workspaces                      | Fast, strict dependency layout, good monorepo support                 |
| Task runner         | Turborepo                            | Simple build/test orchestration and caching                           |
| Build               | `tsc -b` project references          | Stable, transparent, debuggable                                       |
| Dev execution       | `tsx`                                | Fast TypeScript development                                           |
| Local API           | Fastify                              | Typed ecosystem, strong validation and plugin model                   |
| Process integration | `execa`                              | Safe argument-array execution                                         |
| CLI                 | Commander + `@clack/prompts`         | Stable commands and polished setup                                    |
| Contracts           | Zod v4                               | Runtime validation and shared schemas                                 |
| Config              | YAML + Zod                           | Human-maintainable repository policies                                |
| Database            | SQLite                               | Local, portable, transactional, no server                             |
| SQLite driver       | `better-sqlite3` behind adapter      | Mature synchronous driver; easy migration boundary                    |
| ORM/migrations      | Drizzle                              | Explicit schema and migration workflow                                |
| Lexical search      | SQLite FTS5                          | No external service and strong local retrieval                        |
| Embeddings          | Optional provider later              | Prevents premature vector infrastructure                              |
| MCP                 | Official TypeScript SDK, stdio first | Native local Codex integration                                        |
| Git                 | Native `git` via `execa`             | Accurate and ubiquitous                                               |
| GitHub              | `gh` CLI JSON first                  | Reuses user authentication and avoids app setup                       |
| JS/TS analysis      | TypeScript compiler API              | Reliable syntax and import/symbol information                         |
| Vue analysis        | `@vue/compiler-sfc`                  | Correct SFC block extraction                                          |
| File discovery      | `fast-glob` + `ignore`               | Performant, respects repository boundaries                            |
| Logging             | Pino                                 | Structured and Fastify-native                                         |
| Tests               | Vitest                               | Fast TypeScript testing                                               |
| E2E                 | Playwright                           | UI and process-flow coverage                                          |
| UI later            | React + Vite + TanStack Query        | Independent local dashboard with strong data tooling                  |
| Lint/format         | ESLint flat + Prettier               | Mature, explicit, widely understood                                   |

## Why not use Node’s built-in SQLite immediately

Keep the persistence interface independent. The built-in SQLite module is still not the safest long-term foundation while it remains pre-stable. A mature driver behind `MemoryStore` lets the project migrate later without rewriting domain logic.

## Storage layout

Do not place the database in the target repository by default.

Example logical paths:

```text
Windows:
%LOCALAPPDATA%\Gatekeeper\data\<repo-id>\gatekeeper.db

macOS:
~/Library/Application Support/Gatekeeper/data/<repo-id>/gatekeeper.db

Linux:
~/.local/share/gatekeeper/data/<repo-id>/gatekeeper.db
```

Target repository:

```text
.gatekeeper/config.yaml
.gatekeeper/policies.yaml
.gatekeeperignore
```

Optional exportable decisions may be committed as YAML or Markdown after explicit approval.

## Repository identity

Do not key data only by local path.

Use:

- normalized remote identity when available;
- local Git root fingerprint;
- first-seen repository UUID;
- mapping of multiple local worktrees to one repository record.

## Daemon lifecycle

The daemon should support:

```text
gatekeeper daemon start
gatekeeper daemon status
gatekeeper daemon stop
```

Recommended process behavior:

- single-instance lock;
- PID/port/token metadata in app-data directory;
- random available local port or configurable fixed port;
- localhost only;
- graceful shutdown;
- migration on startup;
- crash-safe job states;
- stale PID cleanup.

The MCP server can:

1. discover daemon metadata;
2. start the daemon when allowed;
3. connect with bearer token;
4. return actionable setup errors.

## Data model principles

### Source-addressable

Every conclusion points back to source evidence.

### Temporal

Historical evidence has dates/status. A rejected idea from 2021 is not automatically a current rule.

### Explicit authority

A confirmed ADR and a casual issue comment are not equivalent.

### Revocable

Decisions can become superseded, disputed, or expired.

### Incremental

Indexing uses hashes, cursors, and dependency invalidation.

### Privacy-aware

Store the minimum material needed for retrieval and reproducibility.

## Search and ranking

Use a staged retrieval pipeline:

```text
exact references
  -> identifiers and filenames
  -> FTS5 keyword search
  -> filters by status/date/source
  -> graph neighbors
  -> optional embedding recall
  -> optional model reranking
```

Score dimensions should be inspectable:

- lexical similarity;
- identifier overlap;
- changed-path overlap;
- shared symbols/modules;
- source authority;
- active vs superseded status;
- recency;
- revert/rejection relationship;
- linked issue/PR relationship.

Do not hide retrieval behind one opaque model prompt.

## Local API boundaries

The daemon should not accept arbitrary shell commands or arbitrary file paths.

API input should use:

- registered repository ID;
- validated relative paths;
- validated Git refs;
- typed review targets.

Long-running work returns a job ID.

## GitHub integration progression

### MVP

Use `gh`:

```text
gh auth status
gh repo view --json ...
gh pr view <n> --json ...
gh pr diff <n>
gh api ...
```

Never scrape GitHub HTML.

### Later

Add:

- Octokit adapter;
- GitHub App webhook adapter;
- installation-token authentication;
- organization-level policy.

The domain must not know which provider is active.

## Codex packaging progression

### During development

- repository-local skill;
- project `.codex/config.toml`;
- locally built MCP server.

### Shareable local package

- npm CLI package;
- installer that writes or prints config snippets;
- skill bundle.

### Plugin distribution

After stabilization, add a Codex plugin manifest that bundles:

- Gatekeeper skill;
- MCP configuration/connector metadata;
- optional commands or hooks;
- documentation.

Do not make plugin packaging block the core product.

## Future-proof extension points

Keep these interfaces from the beginning:

```text
LanguageAnalyzer
GitHubProvider
ReasoningProvider
EmbeddingProvider
MemoryStore
ReviewPublisher
SecretScanner
PolicyEvaluator
```

Avoid generic plugin systems before a second real implementation exists. Use interfaces and package boundaries first.

## Versioning

Version separately:

- CLI package;
- daemon API;
- MCP tool contracts;
- policy schema;
- verdict schema;
- database schema;
- project-memory document schema.

Persist schema versions with stored records where relevant.

## Observability without leaking code

Log:

- request ID;
- repository ID;
- operation type;
- durations;
- counts;
- result status;
- error category.

Do not log:

- full source;
- full diffs;
- prompts;
- secrets;
- tokens;
- private issue/PR bodies.

Provide a diagnostic bundle that redacts sensitive content.

## Architecture decisions to record in Phase 0

Create ADRs for:

1. local-first architecture;
2. SQLite as primary storage;
3. Codex skill + MCP integration;
4. `gh` CLI before GitHub App;
5. evidence-first verdict model;
6. no AI-authorship detection;
7. read-only and deterministic enforcement defaults;
8. external app-data storage rather than repository-local DB.
