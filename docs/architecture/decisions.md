# Architecture decision records

All decisions below are accepted for the Build Week scope as of 2026-07-16.

## ADR-001: Local-first architecture

**Context:** Repository evidence can contain private source and credentials. **Decision:** Execute review, storage, service, and dashboard locally; bind the future service to `127.0.0.1`. **Consequence:** No hosted backend, accounts, organizations, or telemetry service in the hackathon build.

## ADR-002: SQLite Project Memory

**Context:** Gatekeeper needs durable, inspectable project history. **Decision:** Use SQLite with FTS5, better-sqlite3, and Drizzle migrations in Phase 3. **Consequence:** No vector database or embeddings for Build Week.

## ADR-003: Codex skill plus stdio MCP

**Context:** The product should participate in the user’s active Codex workflow. **Decision:** Use a repository skill for workflow guidance and a thin stdio MCP adapter for tools. **Consequence:** Codex/GPT reasoning remains explicit while Gatekeeper controls contracts and enforcement.

## ADR-004: Evidence-first deterministic enforcement

**Context:** Model output is probabilistic and repository content is untrusted. **Decision:** Findings declare authority; only a hard `DETERMINISTIC` finding can produce `BLOCK`. **Consequence:** Evidence-supported conflict and high-impact inference escalate for human judgment instead of silently blocking.

## ADR-005: Read-only GitHub behavior

**Context:** A hackathon review tool does not need remote write authority. **Decision:** Future GitHub access uses authenticated `gh` commands with argument arrays and read operations only. **Consequence:** No comments, labels, checks, merges, closes, GitHub App, or stored token.

## ADR-006: MCP TypeScript SDK v1.x until v2 stabilizes

**Context:** The official v2 SDK is not production-stable before the deadline. **Decision:** Pin the production v1.x SDK when MCP is introduced in Phase 4. **Consequence:** Revisit v2 after stability and migration guidance are available.

## ADR-007: CSS Modules without a component library

**Context:** The dashboard needs a precise, quiet product identity with limited time. **Decision:** Use React, CSS Modules, and shared CSS custom properties. **Consequence:** No Tailwind, component framework, charting library, or global state library unless an implemented requirement proves necessary.

## ADR-008: pnpm workspaces without Turborepo

**Context:** Five small Phase 0 packages do not need a second task graph. **Decision:** Use pnpm workspaces and TypeScript project references. **Consequence:** Add orchestration only after measured build needs justify it.
