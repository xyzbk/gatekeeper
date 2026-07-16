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

## Deferred boundaries

The localhost bearer-token lifecycle, Host/Origin checks, CSP, secret denial/redaction, SQLite protection, MCP protocol isolation, and read-only `gh` adapter are required in their scheduled steps and phases. They are not placeholder implementations.

## Logging

Phase 0 has no application logger and Doctor prints only tool availability, versions, and the app-data path. Future structured logs must exclude source, diffs, excerpts, tokens, secrets, and private repository content.
