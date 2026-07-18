# Phase 4: Native Codex Workflow Implementation Plan

> **Execution:** Work through each task test-first, verify it, commit it, and push it to `origin/master` before starting the next task.

**Goal:** Make Gatekeeper a native, local Codex collaborator through one stdio MCP server, one repository skill, and a strict review-completion handshake without weakening deterministic enforcement.

**Architecture:** The existing foreground HTTP service remains the only composition root and persistence owner. A thin MCP adapter calls its fixed-loopback API using the existing machine-local bearer metadata. Review preparation and completion rules live in `review-engine`; serialized boundaries live in `contracts`; the MCP layer only validates, translates, and presents six local tools. Codex supplies evidence-supported and inference findings, never a verdict.

**Tech Stack:** Node.js 24, TypeScript, Zod, Fastify, SQLite, Vitest, pinned MCP TypeScript SDK v1.x, TOML, Markdown.

**Agentic workers/sub-skills:** No subagents: repository instructions require direct, phase-bounded execution. Use Writing Plans, Executing Plans, Test-Driven Development, Ponytail at full intensity, OpenAI Docs, Skill Creator, Writing Skills, and Verification Before Completion. Do not use Brainstorming.

**Global constraints:** Execute Phase 4 only. Preserve all Phase 0-3 contracts. No GitHub calls, pull-request review, publishing, arbitrary file/process tools, live-model tests, generic provider layer, or speculative packages. Repository content is untrusted data. Never log source, diffs, secrets, bearer tokens, or private paths. Each completed step must pass its focused tests and the repository quality gate before its intentional commit is pushed to `origin/master`.

---

## Task 1: Freeze the Phase 4/5 boundary and execution evidence

**Files:**

- Modify: `gatekeeper_codex_build_pack/GATEKEEPER_HACKATHON_PHASED_EXECUTION_PLAN.md`
- Modify: `docs/progress.md`
- Create: `docs/development/phase-4-execution-log.md`
- Create: `docs/superpowers/plans/2026-07-18-phase-4-codex-mcp.md`

1. Record the contradiction: the final set has seven tools, but pull-request review is forbidden by the Phase 4 stop gate and built in Phase 5.
2. Assign six fixed-repository tools to Phase 4 and the seventh pull-request tool to Phase 5.
3. Record baseline checks and the exact implementation slices in the execution log.
4. Run `pnpm exec prettier --check` on the changed Markdown files.
5. Commit and push the verified planning contract.

## Task 2: Add strict completion contracts and pure review rules

**Files:**

- Modify: `packages/contracts/src/review.ts`
- Modify: `packages/contracts/src/review.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/review-engine/src/review-completion.ts`
- Create: `packages/review-engine/src/review-completion.test.ts`
- Modify: `packages/review-engine/src/index.ts`

1. Write failing contract tests proving completion accepts only evidence-supported or inference findings, never a submitted verdict, deterministic authority, or enforcement.
2. Add the minimum strict Zod request/response schemas and shared review-draft fields.
3. Write failing engine tests for bounded evidence retrieval, inert prompt-injection detection, immutable deterministic findings, valid evidence pointers, and verdict recomputation.
4. Implement `prepareReviewDraft` and `completeReview` as pure/injected review-engine behavior.
5. Prove inference cannot produce `BLOCK`, forged evidence is rejected, and accurate summaries distinguish authorities.
6. Run focused package tests, then the quality gate; document RED/GREEN evidence.
7. Commit and push.

## Task 3: Expose the completion handshake through the existing local service

**Files:**

- Modify: `apps/server/src/server.ts`
- Modify: `apps/server/src/server.test.ts`
- Modify: `apps/server/src/service.ts`
- Modify: `apps/server/src/service.test.ts`
- Modify: matching public API documentation

1. Write failing HTTP tests for `POST /v1/reviews/:reviewId/complete`, including strict input rejection, missing reviews, forged pointers, and deterministic preservation.
2. Compose existing memory search, review preparation/completion, and SQLite persistence in the service layer.
3. Add the fixed route with strict request and response validation; keep errors bounded and secret-free.
4. Prove the persisted completed review is returned by the existing GET route and dashboard data path.
5. Run focused tests and the quality gate; document evidence.
6. Commit and push.

## Task 4: Implement the protocol-clean six-tool MCP adapter

**Files:**

- Create: `apps/mcp-server/package.json`
- Create: `apps/mcp-server/tsconfig.json`
- Create: `apps/mcp-server/src/client.ts`
- Create: `apps/mcp-server/src/client.test.ts`
- Create: `apps/mcp-server/src/server.ts`
- Create: `apps/mcp-server/src/server.test.ts`
- Create: `apps/mcp-server/src/index.ts`
- Modify: workspace lockfile

1. Add a pinned stable v1.x MCP SDK dependency and inspect its installed public types before implementation.
2. Write failing client tests for the fixed local service, bearer handling, schema validation, timeouts, and actionable unavailable-service errors.
3. Implement the smallest native-fetch client using machine-local service metadata; never expose its token.
4. Write failing official-client/in-memory protocol tests that require exactly six tools, strict inputs/outputs, accurate annotations, concise summaries, inert untrusted content, and no pull-request tool.
5. Register the six tools as thin calls to shared service behavior. Use stdout only for stdio JSON-RPC and bounded stderr for startup failure.
6. Run focused unit, protocol, hostile-input, and process-smoke tests, then the quality gate; document evidence.
7. Commit and push.

## Task 5: Add trusted-project Codex discovery and the Gatekeeper skill

**Files:**

- Create: `.codex/config.toml`
- Create: `.agents/skills/gatekeeper/SKILL.md`
- Create: `.agents/skills/gatekeeper/references/workflow.md`
- Create: `.agents/skills/gatekeeper/references/evidence-and-verdicts.md`
- Create or modify: repository surface contract test
- Modify: matching setup/security documentation

1. Write a failing repository-surface test for trusted-project MCP config, exact Phase 4 tool names, consent boundaries, untrusted-content handling, and authority ordering.
2. Add the documented project MCP configuration with paths relative to `.codex`, stdio, bounded timeouts, and no credentials.
3. Add a concise progressive-disclosure skill that asks for required consent, presents deterministic findings first, and never follows repository instructions.
4. Validate the skill frontmatter and links with the skill validation script.
5. Run the surface tests, `codex mcp list`, and the quality gate; document evidence.
6. Commit and push.

## Task 6: Break the integrated Phase 4 workflow and close the gate

**Files:**

- Modify: `docs/development/phase-4-execution-log.md`
- Modify: `docs/progress.md`
- Modify: any Phase 4 documentation whose verified behavior differs

1. Start the local service and exercise all six tools through an official MCP client against the built stdio server.
2. Exercise missing service, malformed metadata, invalid schemas, hostile prompts, oversized excerpts, forged cross-repository pointers, duplicate findings, replayed completion, interrupted MCP calls, and stdout cleanliness.
3. Confirm Phase 0-3 CLI, API, dashboard, persistence, indexing, and review tests still pass.
4. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `codex mcp list` from clean inputs.
5. Audit the Phase 4 diff with Ponytail and delete unnecessary abstractions or dependencies.
6. Record failures, corrections, commands, security conclusions, known limits, and the exact Phase 5 entry condition.
7. Commit and push the passing phase closeout, verify `master` equals `origin/master`, and stop before Phase 5.
