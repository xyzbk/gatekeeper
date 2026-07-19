# Policy v1 reference

Gatekeeper policy is strict YAML with `version: 1`. Unknown keys, invalid enum values, negative limits, and empty identifiers/globs are rejected with an actionable dotted path.

The canonical example is `gatekeeper.policy.example.yaml`. Repository policy lives at `.gatekeeper/policies.yaml`; the loader rejects files larger than 256 KiB, non-files, and paths that resolve outside the repository.

`gatekeeper policy validate [path]` requires this file. `gatekeeper review worktree [path]` uses `{ version: 1 }` when it is absent, allowing an unconfigured repository to receive metrics and a `FAST_PATH` result without pretending policy was loaded.

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

## Policy behavior

All deterministic policy findings have `DETERMINISTIC` authority and confidence `1`. For checks that declare enforcement, it maps to finding severity as follows: `advisory` to `low`, `required` to `medium`, and `hard` to `high`. Risk-zone findings use their configured level. Final verdict assembly remains independent and follows the rules in [verdicts.md](verdicts.md).

### Change size

`review.maxChangedFiles` compares its value with the number of included changed paths. `review.maxChangedLines` compares with additions plus deletions across those paths. A finding is produced only when the count is greater than the configured value.

### Source-to-test relationships

For each `tests.relationships` entry, Gatekeeper finds changed paths matching `source`. If at least one source matches and no changed path matches `tests`, it emits one finding covering the matching source paths. This is a worktree-level relationship, not per-file test inference.

### Risk zones

A changed path matching a `riskZones[].paths` pattern emits a risk-zone finding with the configured level. `REQUIRE_CHANGES` maps to required enforcement. `ESCALATE`, or a `high`/`critical` level, requires human approval and therefore escalates. `FAST_PATH` remains advisory unless severity independently requires escalation. A risk zone cannot directly configure `BLOCK`.

### Import boundaries

For changed files matching `architecture.importBoundaries[].from`, Gatekeeper examines only bounded added text lines. It recognizes static `import`, `export ... from`, and dynamic `import()` with relative string specifiers. The normalized repository-relative target is compared with `deny`. If a matching source reaches an added-line or line-length bound, Gatekeeper deterministically escalates the incomplete inspection for human review instead of returning a misleading fast path. Package imports, removed lines, computed specifiers, and semantic module resolution are intentionally outside this check.

### Protected paths

A changed path matching `protectedPaths[].paths` emits the configured message. A protected-path rule with `hard` enforcement produces `BLOCK` because the finding is deterministic. Advisory and required protected paths retain their lower verdict behavior.

## Ignore behavior

- Git's standard ignore rules control untracked discovery.
- `.gatekeeperignore` adds repository-local Git-ignore-style patterns and is capped at 64 KiB.
- `paths.ignore` adds policy patterns.
- Gatekeeper and policy patterns apply to both tracked and untracked assembled changes.

Ignored paths do not contribute metrics, findings, or ReviewRun change summaries.

## Parsed but deferred sections

The v1 parser retains forward-compatible product vocabulary, but it does not evaluate `repository.defaultBase`, linked-issue or description requirements, documentation relationships, generated-file denial, or `riskZones[].requirements`. These fields are validated rather than enforced. The five implemented worktree checks above are the complete policy surface.
