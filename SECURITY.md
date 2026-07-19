# Security policy

Gatekeeper processes repositories, diffs, commit history, and eventually GitHub content. All of that content is untrusted data, not agent instruction.

## Report a vulnerability

Use GitHub private vulnerability reporting for `xyzbk/gatekeeper` when available. Otherwise contact the maintainer privately before public disclosure. Do not include real secrets, private source, tokens, or exploit data in a public issue.

Include the affected version/commit, reproduction steps with synthetic data, impact, and any suggested mitigation.

## Security invariants

- Local-first and read-only by default.
- No stored GitHub personal access token; future GitHub access reuses `gh` authentication.
- No arbitrary shell strings or arbitrary file-read surfaces.
- Repository and remote content never changes tool instructions.
- `BLOCK` requires a hard deterministic finding.
- Evidence excerpts are bounded to 2,000 characters.
- Worktree review accepts at most 500 changed paths, a 2 MiB Git result, and 1 MiB per untracked file.
- Added-line inspection is bounded to 500 lines per file and 2,000 characters per line.
- Raw source and raw diffs never cross into CLI, HTTP, dashboard, logs, or ReviewRun persistence candidates.
- Default tests use no network or credentials.
- `gatekeeper start --deterministic-only` refuses model-assisted completion before parsing or persisting it; deterministic review and Project Memory remain local.
- The judge demo uses a committed fixture transport and disposable local state. It does not invoke live `gh`, a hosted model endpoint, or a GitHub write path.

## Phase 2 review boundary

The Git adapter resolves a canonical repository root before inspection. Every Git invocation uses an executable and argument array. Changed paths must be canonical repository-relative POSIX paths; traversal, absolute paths, control characters, backslashes, and paths whose real target escapes the repository are rejected.

Tracked changes come from bounded Git output. Untracked content is read only after path and regular-file checks. Binary content is identified without decoding it as source. `.gatekeeperignore` is limited to 64 KiB and must resolve inside the repository; `.gatekeeper/policies.yaml` is limited to 256 KiB and must be an in-repository regular file. Git's normal ignore rules apply to untracked discovery, while `.gatekeeperignore` and policy `paths.ignore` apply to the assembled worktree change set.

Added lines exist only in the internal ChangeSet so the deterministic import-boundary policy can inspect them. ReviewRun strips those lines and exposes only paths, status, counts, binary state, and whether inspection was truncated. Logs record stable operation metadata, not repository content, rejected YAML, diffs, source, or bearer tokens.

The changed-path cap is checked before reading each included untracked file. Files that disappear or become unreadable during inspection fail with a stable safe error. When a configured import-boundary source has truncated added-line evidence, Gatekeeper escalates to human review rather than treating the incomplete check as a pass.

All Phase 2 findings use `DETERMINISTIC` authority. `BLOCK` still requires both deterministic authority and `hard` enforcement. Review completion never mutates or publishes the target repository, and a `BLOCK` verdict is not used as a process exit failure in this phase.

## Local service

The localhost service binds only to `127.0.0.1`, validates Host and Origin, protects `/v1/*` with an ephemeral bearer token, applies a restrictive CSP, and rejects unknown API inputs. `POST /v1/reviews/worktree` accepts exactly `{}` with no query or repository selector; repository, index, memory-search, and review-read APIs are all bound to the repository selected when `gatekeeper start` began. The dashboard keeps the token only in memory and sends it only in the Authorization header.

## Phase 3 Project Memory boundary

- The SQLite database lives under Gatekeeper's per-user machine app-data directory, outside target repositories by default.
- Startup enables foreign keys and WAL, verifies FTS5, and applies reviewed versioned migrations before serving requests.
- Incremental index writes and review/finding/evidence writes are immediate transactions; a failure rolls back the complete batch.
- Document and review IDs cannot be reused to transfer records across repository identities.
- Only tracked metadata/hashes, selected bounded Markdown/ADR/policy excerpts, and bounded recent commit metadata/messages are indexed. Full private source files and raw diffs are not persisted.
- Known credential filenames, ignore-matched files, symlinks, oversized documents, and invalid UTF-8 are denied before content enters documents or FTS.
- Exact and FTS searches are repository-scoped. Search syntax is tokenized and parameterized rather than interpolated as SQL.
- Every repository-derived result is capped and labelled `untrusted_repository_content`; the dashboard renders excerpts as plain text.
- Corrupt stored review JSON fails closed with a stable error. API and logs do not expose database errors, source, diffs, secrets, or bearer tokens.

MCP, Codex skill, GitHub data, embeddings, and model-data controls do not exist yet and must not be implied by Phase 3.
