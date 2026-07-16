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
- Default tests use no network or credentials.

Phase 0 provides contracts and Doctor only. The localhost service, MCP boundary, Git/GitHub adapters, database, and model-data controls do not exist yet and must not be implied by this foundation.
