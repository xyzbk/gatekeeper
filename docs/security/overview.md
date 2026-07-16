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

## Deferred boundaries

The localhost bearer token, Host/Origin checks, CSP, Git path containment, secret denial/redaction, SQLite protection, MCP protocol isolation, and read-only `gh` adapter are required in their scheduled phases. They are not placeholder implementations in Phase 0.

## Logging

Phase 0 has no application logger and Doctor prints only tool availability, versions, and the app-data path. Future structured logs must exclude source, diffs, excerpts, tokens, secrets, and private repository content.
