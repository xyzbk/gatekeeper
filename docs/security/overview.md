# Security overview

## Trust boundaries

Trusted inputs are checked-in Gatekeeper configuration and explicit user actions. Repository files, diffs, commit messages, issue/PR text, review comments, and retrieved excerpts are untrusted data. They may contain prompt injection and must never become instructions.

## Phase 0 controls

- Zod contracts are strict and reject unknown fields.
- The committed JSON Schema is generated from and tested against the Zod verdict contract.
- `BLOCK` is assembled only from `DETERMINISTIC` plus `hard` enforcement.
- Evidence excerpts are capped at 2,000 characters by contract.
- YAML policy errors report concrete field paths.
- Doctor uses native process spawning with an executable and argument array; it performs no authentication or network request.
- App state resolves to a per-user OS data location outside repositories.
- CI actions are pinned to immutable commit SHAs and receives read-only repository contents permission.

## Phase 1 Git and contract controls

- The requested repository path is canonicalized and must be a directory.
- Git's reported top level must contain the requested path; an unrelated root is rejected.
- Git commands use `execa` argument arrays and never use shell interpolation.
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

## Deferred boundaries

SQLite protection, MCP protocol isolation, and the read-only `gh` adapter are required in their scheduled phases. They are not placeholder implementations.

## Logging

Doctor prints only tool availability, versions, and the app-data path. The local service disables Fastify's request-header logging and emits its own bounded operational records. Future phases must preserve the same exclusions for source, diffs, excerpts, tokens, secrets, and private repository content.
