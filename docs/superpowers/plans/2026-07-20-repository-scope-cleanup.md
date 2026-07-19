# Repository Scope Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove obsolete build-pack artifacts without changing Gatekeeper behavior, installation, release evidence, or its authoritative hackathon instructions.

**Architecture:** Keep the repository's public product surface and reproducible proof intact. Retain the root product specification and the one canonical hackathon execution plan required by `AGENTS.md`; delete only the unused starter-pack copies and outdated templates that have no live product, installation, or documentation dependency.

**Tech Stack:** Git, pnpm workspace, Markdown documentation, existing Vitest surface tests.

## Global Constraints

- This is a user-authorized post-freeze documentation/repository-hygiene correction; do not change product behavior, dependencies, packages, schemas, tests, demo fixtures, or release controls.
- Preserve `GATEKEEPER_COMPLETE_CODEX_SPEC.md`, `gatekeeper_codex_build_pack/GATEKEEPER_HACKATHON_PHASED_EXECUTION_PLAN.md`, `AGENTS.md`, legal notices, security documentation, and the current README/install path.
- Do not remove execution logs, release evidence, tests, or demo fixtures merely because they are not needed for the first install command.
- Use no new dependency, network request, GitHub mutation, or target-repository operation.
- Commit and push each passing task to `origin/master`; never force-push.

---

### Task 1: Remove obsolete starter-pack copies

**Files:**

- Delete: `gatekeeper_codex_build_pack/AGENTS.template.md`
- Delete: `gatekeeper_codex_build_pack/ARCHITECTURE_AND_STACK.md`
- Delete: `gatekeeper_codex_build_pack/DOCUMENTATION_BLUEPRINT.md`
- Delete: `gatekeeper_codex_build_pack/gatekeeper.policy.example.yaml`
- Delete: `gatekeeper_codex_build_pack/GATEKEEPER_MASTER_BUILD_PROMPT.md`
- Delete: `gatekeeper_codex_build_pack/PHASED_EXECUTION_PLAN.md`
- Delete: `gatekeeper_codex_build_pack/PHASE_PROMPTS.md`
- Delete: `gatekeeper_codex_build_pack/POSAPPV4_PILOT_AND_DEMO_REPO.md`
- Delete: `gatekeeper_codex_build_pack/README_FIRST.md`
- Delete: `gatekeeper_codex_build_pack/verdict.schema.json`
- Preserve: `gatekeeper_codex_build_pack/GATEKEEPER_HACKATHON_PHASED_EXECUTION_PLAN.md`

**Interfaces:**

- Consumes: the inventory and reference audit from the current `master` worktree.
- Produces: a single-purpose `gatekeeper_codex_build_pack/` directory containing only the canonical plan still named by repository instructions.

- [x] **Step 1: Verify the deletion boundary before changing files**

Run:

```powershell
git grep -n -I -- "GATEKEEPER_HACKATHON_PHASED_EXECUTION_PLAN.md"
```

Expected: `AGENTS.md` and historical execution records name the canonical plan. Do not delete that file.

- [x] **Step 2: Delete only the ten obsolete starter artifacts**

Run:

```powershell
git rm gatekeeper_codex_build_pack/AGENTS.template.md gatekeeper_codex_build_pack/ARCHITECTURE_AND_STACK.md gatekeeper_codex_build_pack/DOCUMENTATION_BLUEPRINT.md gatekeeper_codex_build_pack/gatekeeper.policy.example.yaml gatekeeper_codex_build_pack/GATEKEEPER_MASTER_BUILD_PROMPT.md gatekeeper_codex_build_pack/PHASED_EXECUTION_PLAN.md gatekeeper_codex_build_pack/PHASE_PROMPTS.md gatekeeper_codex_build_pack/POSAPPV4_PILOT_AND_DEMO_REPO.md gatekeeper_codex_build_pack/README_FIRST.md gatekeeper_codex_build_pack/verdict.schema.json
```

Expected: the canonical hackathon plan remains; no runtime or installation file changes.

- [x] **Step 3: Verify the reduced build-pack surface and product regressions**

Run:

```powershell
Get-ChildItem gatekeeper_codex_build_pack -File
pnpm exec vitest run --config vitest.workspace.ts apps/mcp-server/src/repository-surface.test.ts
pnpm build
git diff --check
```

Expected: exactly `GATEKEEPER_HACKATHON_PHASED_EXECUTION_PLAN.md` remains in the directory; the focused surface test, build, and diff check pass.

- [x] **Step 4: Commit the verified file removal**

Run:

```powershell
git add -u gatekeeper_codex_build_pack
git commit -m "chore: remove obsolete build pack artifacts"
git push origin master
```

Expected: one intentional, green commit on `origin/master`.

### Task 2: Record the cleanup and remove generated local residue

**Files:**

- Modify: `docs/progress.md`
- Create: none
- Remove locally if present: `test-results/`

**Interfaces:**

- Consumes: the narrowed build-pack directory from Task 1.
- Produces: an auditable record of what was removed and an otherwise clean local worktree.

- [x] **Step 1: Add a concise post-freeze cleanup record**

Append a `User-authorized post-freeze repository scope cleanup` section to `docs/progress.md` that states the ten starter artifacts were removed, the canonical hackathon plan remains because `AGENTS.md` requires it, and no product behavior or release evidence changed.

- [x] **Step 2: Verify ignored generated test output is outside version control**

Run:

```powershell
$target = (Resolve-Path test-results).Path
if ($target -ne 'D:\work\gatekeeper\test-results') { throw 'Refusing to remove an unexpected path.' }
Remove-Item -LiteralPath $target -Recurse -Force
```

Expected: only ignored Playwright output is eligible for removal; no tracked path is deleted.

Result: `test-results/` resolved exactly to `D:\work\gatekeeper\test-results`, but the execution host rejected the recursive deletion before it ran. It remains ignored and does not affect the repository's tracked cleanup.

- [x] **Step 3: Run the documentation and repository acceptance checks**

Run:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
git status --short
```

Expected: all checks pass; only the cleanup-record and cleanup-plan changes are staged for this task and no generated test output remains.

- [x] **Step 4: Commit and push the cleanup record**

Run:

```powershell
git add docs/progress.md docs/superpowers/plans/2026-07-20-repository-scope-cleanup.md
git commit -m "docs: record repository scope cleanup"
git push origin master
```

Expected: the cleanup history, plan, and current repository state are traceable on `origin/master`.
