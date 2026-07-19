# Devpost project draft

## Title

Gatekeeper — Project memory with deterministic guardrails for Codex

## Tagline

The code may pass; Gatekeeper shows whether it still belongs.

## What it does

Gatekeeper is a local-first repository intelligence layer for Codex. It reviews a fixed local worktree or GitHub pull request, applies deterministic policy, stores bounded Project Memory in local SQLite, retrieves linked decisions and regressions, and exposes the same review through a CLI, loopback dashboard, MCP server, and Codex skill.

Its Ghost Change demo is the proof point: a passing pull request revives a required Redis cache after a proposal, regression, revert, and active ADR. Gatekeeper shows the ordered chain and returns `ESCALATE` instead of pretending the diff alone settles the decision.

## How it was built

TypeScript, Node.js 24, React/Vite, Fastify, SQLite/Drizzle, Zod, the official MCP TypeScript SDK, Git, `gh` read adapters, and a local deterministic Ghost fixture. The dashboard is a local loopback surface; there is no hosted backend, account system, analytics product, or GitHub publication path.

## Codex / GPT-5.6 disclosure

GPT-5.6 in Codex was used as the implementation partner for planning, test-first development, code review, documentation, and local verification. Gatekeeper’s shipped verdict rules, schemas, tests, and release evidence are committed in this repository. Codex-authored review findings remain constrained by Gatekeeper’s strict completion contract; model inference cannot create `BLOCK`.

## Prior work

The product specification and Phase 0 contract baseline existed before later Build Week slices. The submission’s implemented local CLI/API/MCP/dashboard workflow, Ghost Change demo, evaluation, and Phase 7 hardening are traceable in this repository’s commits. If event rules require a more specific prior-work declaration, the user must supply and approve it before submission.

## Challenges

The difficult part was preserving a strict boundary: GitHub/repository prose is useful evidence but untrusted data, while a model is helpful reasoning but cannot own enforcement. The solution keeps evidence bounded, uses deterministic verdict assembly, validates model completion claims exactly, and makes uncertainty visible as `ESCALATE`.

## Accomplishments

- A real local dashboard, CLI, seven-tool MCP server, and Codex skill over one fixed repository.
- Durable SQLite Project Memory with linked historical evidence and restart-safe review operations.
- A network-free Ghost Change that proves a passing change can still conflict with project history.
- One-command smoke/evaluation evidence covering `FAST_PATH`, `REQUIRE_CHANGES`, `BLOCK`, and `ESCALATE`.

## Submission actions — Requires user authorization

- Choose category, screenshots, and final wording.
- Create or edit the Devpost project.
- Upload the video.
- Share private-repository access if required.
- Submit the project.
