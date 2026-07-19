# Verdict and finding reference

The canonical machine contract is `packages/contracts/src/review.ts`; `schemas/verdict.schema.json` is its tested JSON Schema representation.

## Verdicts

- `FAST_PATH`: no finding raises the verdict floor.
- `REQUIRE_CHANGES`: deterministic required remediation exists.
- `ESCALATE`: a high-impact, critical, evidence-supported, or uncertain finding needs human judgment.
- `BLOCK`: at least one hard deterministic finding exists.

`INFERENCE` and `EVIDENCE_SUPPORTED` can never produce `BLOCK`, even if their enforcement field is incorrectly supplied as `hard`.

Verdict assembly checks in this order: hard deterministic finding, human-approval or high/critical finding, required finding, then `FAST_PATH`. A hard inference therefore cannot block, while a high-severity inference may still escalate for human judgment.

## Finding authority

- `DETERMINISTIC`: reproducible policy or repository fact.
- `EVIDENCE_SUPPORTED`: conclusion backed by explicit evidence pointers.
- `INFERENCE`: useful but uncertain model judgment.

Findings carry severity, confidence, bounded evidence, remediation, approval need, and optional enforcement. Unknown serialized fields are rejected.

Gatekeeper creates deterministic findings from five worktree checks:

- changed-file and changed-line limits;
- source changes without a matching test change;
- configured risk-zone paths;
- added relative imports crossing a denied boundary;
- protected-path changes.

Finding IDs and ordering are stable for the same policy and ChangeSet. File summaries and path groups are sorted. Review IDs and timestamps identify an execution and are not inputs to policy decisions.

## Evidence pointers

Evidence identifies a repository and source without embedding an unbounded document. Supported sources are file, commit, pull request, issue, comment, ADR, policy, test, and decision. Excerpts are limited to 2,000 characters.

## ReviewRun v1 worktree result

The serialized contract contains:

- opaque local `reviewId` and `repositoryId` values;
- the `worktree` target and final verdict;
- summary, findings, metrics, and creation time;
- bounded change summaries with path, previous path for renames, status, additions, deletions, binary state, and `contentTruncated`.

The internal ChangeSet may carry capped added lines for deterministic import checks. ReviewRun never contains those lines or a raw diff. `contentTruncated` truthfully reports when that internal inspection reached a per-file line or line-length bound.

CLI JSON, the local API, and the dashboard all validate or render this same strict Zod-owned ReviewRun v1 contract. The committed `schemas/verdict.schema.json` is its draft-2020-12 representation; Fastify registers the generated draft-7 API representation.
