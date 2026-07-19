# Phase 7 threat model

## Scope

This assesses the implemented Phase 0–6 Gatekeeper product only: a local CLI, loopback Fastify service, React dashboard, stdio MCP adapter, local SQLite Project Memory, deterministic review engine, and read-only GitHub CLI adapter. It does not claim controls for deferred hosted, multi-user, GitHub Action, publication, or marketplace features.

## Trust-boundary register

| Boundary                            | Threat                                                                 | Implemented control                                                                                                                                 | Regression evidence                               | Remaining limit                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Repository paths and worktree files | Traversal, symlink escape, denied secret reads                         | Canonical root checks, strict relative paths, regular-file checks, denylist, size caps                                                              | Git adapter, config, Project Memory tests         | Git remains the source of worktree truth; Gatekeeper is not a sandbox for arbitrary hooks. |
| Git and `gh` subprocesses           | Argument injection or private output disclosure                        | Executable-plus-argument arrays, shell disabled, bounded output/timeouts, stable errors                                                             | Git/GitHub adapter tests                          | A locally compromised executable is outside Gatekeeper's trust boundary.                   |
| Repository and GitHub content       | Prompt injection or poisoned history                                   | Content is untrusted data, bounded, schema-validated, relationship-scoped, and rendered as text; injection creates deterministic escalation         | Review engine, Project Memory, Ghost Change tests | Detection is bounded heuristic defense; it is not a claim to recognize every encoding.     |
| Loopback HTTP and dashboard         | DNS rebinding, hostile Host/Origin, token leakage                      | `127.0.0.1` bind, exact Host/Origin checks, timing-safe bearer comparison, same-origin bootstrap, no-store/CSP headers                              | Server and dashboard client tests                 | A local user with process access can inspect its own local environment.                    |
| SQLite Project Memory               | Cross-repository collisions, corrupt records, private-source retention | Repository-owned IDs, atomic transactions, strict parsing, bounded metadata/excerpts, app-data outside target repo                                  | Store and Project Memory tests                    | Machine-local state is not encrypted at rest by Gatekeeper.                                |
| Codex completion                    | Forged evidence, model-authored `BLOCK`, unwanted model reasoning      | Strict completion schema, exact draft evidence validation, immutable deterministic findings, local verdict assembly, deterministic-only route guard | Contract, review-engine, server tests             | Codex remains an external interactive agent; user consent governs its use.                 |
| Release/demo tooling                | Network-dependent or destructive judge path                            | Exported Ghost fixture, temporary repositories, local service, no `gh`/model request in smoke scripts                                               | Demo, Playwright, and eval tests                  | Browser/video publication occurs only with user approval.                                  |

## Security conclusions

- Gatekeeper does not publish to GitHub and does not store GitHub tokens.
- `BLOCK` is deterministic hard-policy only; model inference cannot create it.
- Default and judge tests do not require GitHub authentication, a network connection, or an OpenAI key.
- Errors and structured logs must exclude source, raw diffs, excerpts, headers, bearer tokens, credentials, and private exception text.
- Release artifacts must distinguish verified local evidence from external actions that still need user authorization.
