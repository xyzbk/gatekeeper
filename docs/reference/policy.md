# Policy v1 reference

Gatekeeper policy is strict YAML with `version: 1`. Unknown keys, invalid enum values, negative limits, and empty identifiers/globs are rejected with an actionable dotted path.

The canonical example is `gatekeeper.policy.example.yaml`.

## Supported sections

- `repository.defaultBase`
- `review.linkedIssue` and `review.description`
- `review.maxChangedFiles` and `review.maxChangedLines`
- `paths.ignore`
- `tests.relationships`
- `documentation.relationships`
- `riskZones`
- `protectedPaths`
- `architecture.importBoundaries`
- `generatedFiles`

Enforcement values are `advisory`, `required`, and `hard`. Risk-zone verdict floors are `FAST_PATH`, `REQUIRE_CHANGES`, or `ESCALATE`; policy configuration cannot set a risk-zone floor directly to `BLOCK`.

Phase 0 validates configuration only. Glob matching and policy evaluation begin in the deterministic review phase; the parser does not pretend those behaviors exist yet.
