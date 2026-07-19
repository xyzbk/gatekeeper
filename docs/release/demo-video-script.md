# Three-minute demo narration

## 0:00–0:20 — Problem

“A change can be locally correct and still revive a decision the project already rejected. Gatekeeper gives Codex local deterministic enforcement plus durable project memory, then shows the evidence behind the decision.”

Show the dashboard Overview and the repository’s local-first status.

## 0:20–0:55 — Local safety

“Gatekeeper is one loopback process for one fixed repository. It stores Project Memory outside that repository, keeps its bearer token only in memory, and treats repository and GitHub text as untrusted data. Deterministic policy, not the model, owns `BLOCK`.”

Show the review route and one deterministic protected-path result.

## 0:55–1:45 — Wow moment: Ghost Change

Run `pnpm demo`, open the printed local URL, then use Pull request review. Show the passing Redis pull request, ordered proposal/implementation/regression/revert/ADR/revival evidence, partial-history disclosure, and `ESCALATE` verdict.

“The code passes, but Project Memory finds the rejected Redis decision and the later revival. Gatekeeper does not hide that ambiguity behind a confident answer—it escalates it with the trace.”

## 1:45–2:20 — Codex and completion boundary

Show the local MCP/skill flow or review draft. “Codex can add evidence-supported or inference findings, but cannot submit a verdict, alter deterministic findings, or create `BLOCK`. `gatekeeper start --deterministic-only` disables completion entirely for a credential-free demonstration.”

## 2:20–2:45 — Reproducibility

Run `pnpm demo:smoke` and show the six verdicts, then `pnpm model-data:dry-run` with `modelCalls: 0` and metadata-only pointers.

## 2:45–3:00 — Close

“Gatekeeper gives Codex project memory with proof: local, bounded, deterministic where it matters, and explicit when a human must decide.”

## Publication boundary

Recording, editing, uploading, and publishing this video require user authorization.
