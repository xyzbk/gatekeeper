# Phase 4 execution log

## Scope

Phase 4 adds the native local Codex workflow: a strict completion handshake, six fixed-repository MCP tools, trusted-project MCP discovery, and a Gatekeeper repository skill. Pull-request review and all GitHub behavior remain Phase 5 work.

## Baseline

- Starting commit: `5a45712351edb250cf03b2d1af35535271705eaa`
- `pnpm typecheck`: PASS
- `pnpm test`: PASS (27 files, 156 tests)
- Package-boundary inspection: PASS; `domain` remains infrastructure-free and Phase 3 adapters point inward.

## Planning correction

The earlier Phase 4 wording required all seven final MCP tools while its stop gate prohibited pull-request review and Phase 5 owned the GitHub-backed implementation. The corrected contract assigns six fully local tools to Phase 4 and adds `gatekeeper_review_pull_request` in Phase 5 only when its real backend exists. This avoids a placeholder tool and preserves the stop gate.

## Execution evidence

### Task 1 — phase boundary and execution contract

- Commit `b2b931e` aligned the six-tool Phase 4 boundary with the seven-tool final state and was pushed to `origin/master`.
- Markdown formatting and `git diff --check`: PASS.

### Task 2 — completion contracts and review rules

Expected RED:

- `packages/review-engine/src/review-completion.test.ts` could not import the not-yet-created module.
- `reviewCompletionInputSchema` did not exist.
- `reviewDraftSchema` rejected `changes` and `previousReviewId`.

Implemented:

- Strict model-authored finding and completion-input contracts omit verdict, deterministic authority, policy identity, and enforcement.
- Review drafts retain changed-file summaries and previous-review identity.
- `prepareReviewDraft` derives at most eight local-memory queries, requests five results per query, retains at most twenty unique repository-owned pointers, and labels instruction-like evidence with a deterministic content-security finding.
- `completeReview` preserves draft deterministic findings, accepts only offered evidence, rejects cross-repository pointers and unchanged affected paths, prevents ID collision, fixes the reasoning provider to Codex, and recomputes the verdict.

Unexpected failure and correction:

- The first full lint found one unnecessary `never` assertion in a collision test. The assertion was removed; production behavior was unaffected.

GREEN:

- Focused contracts/review-engine tests: PASS (16 tests).
- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- `pnpm test`: PASS (28 files, 168 tests).
- `pnpm build`: PASS.

Further RED states, GREEN commands, unexpected failures, corrections, aggressive-test results, and commit hashes will be appended per verified task.

### Task 3 — local completion API and persistence

Expected RED:

- Draft and completion routes returned `404`.
- The generated review-draft and completion-input schemas were not registered with Fastify.

Implemented:

- Added authenticated `GET /v1/reviews/:reviewId/draft` and `POST /v1/reviews/:reviewId/complete` routes with strict shared schemas and no repository/path selector.
- The foreground service composes stored review loading, bounded memory retrieval, pure completion validation, verdict assembly, and atomic Project Memory persistence.
- Invalid evidence claims map to the stable `USAGE_ERROR` response; rejected values and internal details are not returned or logged.

GREEN:

- Server unit/integration suite: PASS (22 tests).
- Live in-process restart test proves draft preparation, completion, forged-evidence rejection, persistence, and reload.

Unexpected failure and correction:

- The first root lint rejected two intentionally unused names in a test double. The test double now omits those parameters; production behavior was unaffected.

### Task 4 — six-tool stdio MCP adapter

Expected RED:

- MCP client and server test suites could not import the not-yet-created modules.

Implemented:

- Added `apps/mcp-server` with exact `@modelcontextprotocol/sdk` v1.29.0, its documented `.js` import subpaths, stdio transport, native fetch, and Zod v4 contracts.
- The client reads validated machine-local service metadata for each operation, calls only the recorded loopback origin, applies the bearer token in memory, uses a 30-second default timeout, and returns bounded repair/errors without response bodies or secrets.
- Registered exactly six local Phase 4 tools with strict input/output schemas, structured content, concise text, accurate read/write/idempotence/open-world annotations, and no pull-request or publication tool.
- MCP server instructions and tool descriptions label repository evidence as untrusted data. Unknown internal failures become a fixed repair instruction rather than leaking exception text.
- Official SDK in-memory and real stdio clients exercise discovery and all six handlers; successful stdio initialization/listing proves protocol stdout is uncontaminated.

Unexpected failures and corrections:

- The first client fixture incorrectly spread ReviewRun-only `verdict` and `summary` fields into a strict ReviewDraft. The fixture now represents the actual draft contract.
- One repair-text assertion expected a shorthand command instead of the repository's real CLI command and was corrected.
- Initial lint found one unused mock argument and unsafe matcher values from SDK result types. The mock now omits the argument, and assertions parse structured output through shared schemas.

GREEN:

- Focused MCP client/protocol suite: PASS (8 tests).
- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- `pnpm test`: PASS (30 files, 180 tests).
- `pnpm build`: PASS.

### Task 5 — trusted-project config and Gatekeeper skill

Expected RED:

- The MCP status contract did not exist and status lacked index freshness.
- Trusted-project config and all three skill files were absent.

Implemented:

- `gatekeeper_status` now combines validated service status with fixed-repository memory status so Codex can distinguish uninitialized, stale, and current indexes without adding a seventh local tool.
- Added credential-free `.codex/config.toml` for the built stdio server, with paths relative to `.codex` and bounded startup/tool timeouts.
- Added a concise Gatekeeper skill plus progressive workflow and evidence/verdict references. It batches consent where possible, orders findings by authority, treats repository text as untrusted data, and forbids unrequested remediation.
- Added a repository-surface contract test for config, six-tool scope, consent, trust, finding order, reference links, and the Phase 5 stop boundary.

Unexpected environment/tooling failures and corrections:

- The skill validator's default and bundled Python environments lacked PyYAML. PyYAML 6.0.3 was installed into a temporary validation-only directory; no repository or global Python environment was changed. The official validator then passed.
- The first post-contract stdio subprocess could see a stale compiled contracts export because the root `tsconfig.json` contains project references but no path mappings. The smoke test now explicitly supplies `tsconfig.base.json`, so a clean `pnpm test` does not depend on a preceding build.
- The desktop app's PATH resolves `codex` inside the protected WindowsApps package, but this shell receives OS `Access is denied` before the CLI starts. Repository config contracts and real official-SDK stdio discovery pass; the exact `codex mcp list` acceptance remains to be retried during closeout.

GREEN:

- Focused status/config/skill/MCP suite: PASS (11 tests).
- Skill Creator `quick_validate.py`: PASS.
