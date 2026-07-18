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

## Phase 2 review boundary

The Git adapter resolves a canonical repository root before inspection. Every Git invocation uses an executable and argument array. Changed paths must be canonical repository-relative POSIX paths; traversal, absolute paths, control characters, backslashes, and paths whose real target escapes the repository are rejected.

Tracked changes come from bounded Git output. Untracked content is read only after path and regular-file checks. Binary content is identified without decoding it as source. `.gatekeeperignore` is limited to 64 KiB and must resolve inside the repository; `.gatekeeper/policies.yaml` is limited to 256 KiB and must be an in-repository regular file. Git's normal ignore rules apply to untracked discovery, while `.gatekeeperignore` and policy `paths.ignore` apply to the assembled worktree change set.

Added lines exist only in the internal ChangeSet so the deterministic import-boundary policy can inspect them. ReviewRun strips those lines and exposes only paths, status, counts, binary state, and whether inspection was truncated. Logs record stable operation metadata, not repository content, rejected YAML, diffs, source, or bearer tokens.

The changed-path cap is checked before reading each included untracked file. Files that disappear or become unreadable during inspection fail with a stable safe error. When a configured import-boundary source has truncated added-line evidence, Gatekeeper escalates to human review rather than treating the incomplete check as a pass.

All Phase 2 findings use `DETERMINISTIC` authority. `BLOCK` still requires both deterministic authority and `hard` enforcement. Review completion never mutates or publishes the target repository, and a `BLOCK` verdict is not used as a process exit failure in this phase.

## Local service

The localhost service binds only to `127.0.0.1`, validates Host and Origin, protects `/v1/*` with an ephemeral bearer token, applies a restrictive CSP, and rejects unknown API inputs. `POST /v1/reviews/worktree` accepts exactly `{}` with no query or repository selector; its callback is bound to the repository selected when `gatekeeper start` began. The dashboard keeps the token only in memory and sends it only in the Authorization header.

SQLite, Project Memory, MCP, GitHub data, and model-data controls do not exist yet and must not be implied by Phase 2.
