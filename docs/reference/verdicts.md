# Verdict and finding reference

The canonical machine contract is `packages/contracts/src/review.ts`; `schemas/verdict.schema.json` is its tested JSON Schema representation.

## Verdicts

- `FAST_PATH`: no finding raises the verdict floor.
- `REQUIRE_CHANGES`: deterministic required remediation exists.
- `ESCALATE`: a high-impact, critical, evidence-supported, or uncertain finding needs human judgment.
- `BLOCK`: at least one hard deterministic finding exists.

`INFERENCE` and `EVIDENCE_SUPPORTED` can never produce `BLOCK`, even if their enforcement field is incorrectly supplied as `hard`.

## Finding authority

- `DETERMINISTIC`: reproducible policy or repository fact.
- `EVIDENCE_SUPPORTED`: conclusion backed by explicit evidence pointers.
- `INFERENCE`: useful but uncertain model judgment.

Findings carry severity, confidence, bounded evidence, remediation, approval need, and optional enforcement. Unknown serialized fields are rejected.

## Evidence pointers

Evidence identifies a repository and source without embedding an unbounded document. Supported sources are file, commit, pull request, issue, comment, ADR, policy, test, and decision. Excerpts are limited to 2,000 characters.
