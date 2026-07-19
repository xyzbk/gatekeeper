# Security overview

## Trust boundaries

Trusted inputs are checked-in Gatekeeper configuration and explicit user actions. Repository files, diffs, commit messages, issue/PR text, review comments, and retrieved excerpts are untrusted data. They may contain prompt injection and must never become instructions.

## Phase 0 controls

- Zod contracts are strict and reject unknown fields.
- The committed JSON Schema is generated from and tested against the Zod verdict contract.
- `BLOCK` is assembled only from `DETERMINISTIC` plus `hard` enforcement.
- Evidence excerpts are capped at 2,000 characters by contract.
- YAML policy errors report concrete field paths.
- Doctor uses native process spawning with an executable and argument array, output ignored, and a 30-second timeout; it performs no authentication or network request.
- App state resolves to a per-user OS data location outside repositories.
- CI actions are pinned to immutable commit SHAs and receives read-only repository contents permission.

## Phase 1 Git and contract controls

- The requested repository path is canonicalized and must be a directory.
- Git's reported top level must contain the requested path; an unrelated root is rejected.
- Git commands use `execa` argument arrays, shell-disabled execution, bounded output, and 30-second timeouts; they never use shell interpolation.
- Git output is parsed into a strict shared `RepositorySnapshot` contract.
- Adapter errors do not echo subprocess stdout or stderr, preventing accidental source, path, or secret disclosure.
- Health and status are different strict contracts; the health shape has no repository or path fields.
- Service metadata and dashboard bootstrap contracts require loopback URLs and a high-entropy bearer-token shape.

## Phase 1 local-service controls

- Fastify binds explicitly to `127.0.0.1` on an available port.
- A 32-byte token is generated with `node:crypto` and written to machine-local service metadata with mode `0600` where supported.
- Protected `/v1/*` requests require a timing-safe bearer-token comparison.
- The browser obtains bootstrap configuration from the same origin with `Cache-Control: no-store`; the token is not placed in a URL or log.
- The dashboard keeps bootstrap and bearer state in a module closure only. It does not use local storage, session storage, cookies, URL state, or rendered markup for the token.
- Browser responses are validated again with the shared strict Zod contracts before any value is rendered.
- Host must resolve exactly to `127.0.0.1`; a supplied Origin must match the request Host and use HTTP.
- No CORS response headers are enabled.
- CSP permits only same-origin scripts, styles, fonts, images, and API connections. Framing, objects, forms, and base-URL changes are denied.
- Fastify rejects unknown query fields instead of silently removing them. In particular, `/v1/status` rejects arbitrary repository paths.
- API validation and not-found failures use the shared strict error envelope.
- Structured Pino logs contain request ID, operation, duration, result count, result state, and error category only. They exclude headers, payloads, repository paths, source, diffs, and tokens.
- Service metadata is removed during orderly shutdown.
- `gatekeeper start` prints the repository root and loopback URL but never prints the bearer token. Unexpected startup errors are reduced to a bounded message rather than exposing subprocess or filesystem details.

## Phase 2 worktree-review controls

- Staged, unstaged, and untracked inputs are path-contained and bounded before the pure review engine receives them.
- Raw source and raw diffs never enter ReviewRun, CLI output, HTTP responses, dashboard state, or logs.
- Deterministic policy remains the only authority capable of producing `BLOCK`.

## Phase 3 Project Memory controls

- The machine-local SQLite database is outside the target repository by default and starts only after WAL, foreign-key, migration, and FTS5 checks.
- Index batches and persisted reviews are atomic. Repository ownership is enforced for document and review identities, including collision attempts.
- Selected Markdown, ADR, policy, and commit evidence is bounded to 2,000-character excerpts; known secret files, ignore matches, non-regular files, oversized content, and invalid UTF-8 are denied before persistence.
- Search is repository-scoped, exact-first, FTS-tokenized, parameterized, capped, and labelled `untrusted_repository_content`.
- Corrupt persisted review JSON fails closed. Restart tests prove durable reads without widening repository selection.

## Phase 4 MCP and Codex controls

- Trusted-project MCP configuration contains only a local Node command, relative build path, working directory, and bounded timeouts; it contains no token or model credential.
- The stdio server registers exactly nine fixed-repository tools. The GitHub tool reads one positive-numbered pull request through the local service; the two commit tools list at most ten indexed metadata rows or review one full SHA against its first parent. They persist only machine-local state, never check out a commit, and expose no arbitrary path, file-read, subprocess, remote selector, synchronization, or publication capability.
- Protocol stdout is JSON-RPC only. Startup stderr and tool failures are bounded and exclude exception text, service metadata, response bodies, source, diffs, and tokens.
- The client validates `service.json`, accepts only its strict loopback URL and high-entropy bearer shape, applies a 30-second request timeout, and validates every API response again.
- `gatekeeper_status` reads the current and indexed HEAD so Codex can avoid unnecessary index writes.
- ReviewDraft evidence is repository-owned, deduplicated, capped, and untrusted. Instruction-like repository text creates a deterministic content-security finding but never changes the workflow or tool set.
- Completion accepts only `EVIDENCE_SUPPORTED` and `INFERENCE`; unknown fields, duplicate IDs, deterministic authority, enforcement, policy identity, submitted verdicts, forged/cross-repository pointers, and unchanged affected paths are rejected.
- Deterministic findings remain immutable and Gatekeeper recomputes the verdict. Model inference cannot create `BLOCK`.
- The Gatekeeper skill requires consent before first setup/indexing and model reasoning when the current request has not already authorized the action. It never remediates or changes files without a separate explicit request.

## Phase 5 GitHub history controls

- The production GitHub provider uses `execa` with `shell: false`, stdin disabled, argument arrays, a 30-second timeout, and a 2 MiB output cap.
- Supported provider commands are read-only: authentication status, pull-request view, and explicit GET API endpoints. No token is requested, returned, persisted, or logged.
- Remote identity accepts one credential-free GitHub.com HTTPS/SSH owner/repository target. Other hosts, extra path segments, credentials, ports, queries, fragments, and shell metacharacters are rejected before execution. GitHub Enterprise routing remains deferred rather than risking a host/repository mismatch.
- Pull-request bodies, issue text, comments, reviews, paths, and patches are bounded and schema-validated as untrusted data. A malformed record yields a partial result without discarding valid records.
- Remote documents retain bounded GitHub URLs for evidence navigation but are stored only in the repository-scoped machine-local database.
- Partial batches do not advance their cursor, so a malformed record is retried. Stale complete batches cannot rewind the cursor or overwrite newer remote evidence.
- Local index batches manage only local source types; they cannot delete GitHub evidence. Ordered remote relationships resolve only within the registered repository.
- The demo seeder is outside the production adapter and defaults to a zero-request dry-run. Its explicit apply executor validates one exact target, preflights fixed branch names, acts only on stable scenario markers, uses executable-plus-argument arrays, and has no merge, delete, reset, or unrelated-object update operation. No live apply is part of automated acceptance.

## Foundation hardening controls

- One machine-local owner lock permits only one foreground Gatekeeper service. A live owner cannot have its metadata removed by a second start attempt; an abandoned lock is reclaimed only after its recorded process is absent.
- Project Memory remains tied to the configured root and normalized remote. A changed remote fails closed rather than reusing or mixing a prior project's memory, while status reads live Git state for freshness.
- Dashboard-started reviews admit one active local operation at a time. Shutdown stops new starts, records each active operation as a bounded terminal failure when possible, and prevents a resumed old task from writing a review afterward.
- If an operation's terminal write itself fails, the foreground service retains that bounded failure in memory so polling does not misleadingly remain queued or running. It is discarded only when the service stops; no source, diff, token, or exception content is exposed.
- Startup and Doctor fail closed if SQLite integrity or stored review-operation JSON is corrupt. `gatekeeper doctor --repair` is explicit: it writes a consistent machine-local backup before deleting only unparsable operation rows, never repository files, valid reviews, source, diffs, or remote data.

## Deferred boundaries

Pull-request CLI, fixed-repository API, MCP, and dashboard composition are implemented. The dashboard creates external anchors only for parsed `https://github.com/...` evidence URLs and renders all other values as text. GitHub publication, checks, comments, labels, merges, closes, and Actions remain deferred.

## Phase 7 release controls

- Deterministic-only startup rejects the completion endpoint before it interprets submitted model findings. It does not disable deterministic review, Project Memory, dashboard reads, or bounded local indexing.
- `pnpm model-data:dry-run` exercises the fixture-backed provider and review-draft path with zero model calls, then reports counts and source pointer metadata only—never source bodies or excerpts.
- `pnpm demo` and `pnpm demo:smoke` use a committed Ghost fixture, a disposable local Git repository, and a loopback service. They do not invoke the live GitHub CLI, external network, model endpoints, or GitHub write operations.
- Release helpers and local capability probes follow the same subprocess boundary: executable-plus-argument calls, a 30-second timeout, and a 1 MiB cap whenever output is read.
- User-authorized video, Devpost, repository sharing, and feedback-session actions remain outside automated release work.

## Logging

Doctor prints only tool availability, versions, and the app-data path. The local service disables Fastify's request-header logging and emits its own bounded operational records. Future phases must preserve the same exclusions for source, diffs, excerpts, tokens, secrets, and private repository content.
