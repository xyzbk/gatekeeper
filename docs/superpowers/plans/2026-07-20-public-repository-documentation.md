# Public Repository Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public GitHub repository understandable to a first-time maintainer or contributor without changing Gatekeeper’s product behavior.

**Architecture:** Keep the root README as the visitor-facing product entry point. Link to the existing authoritative references instead of duplicating implementation history. Add one contributor guide for development expectations, then align the GitHub repository description and topics with the published README.

**Tech Stack:** GitHub-flavored Markdown, existing pnpm commands, GitHub repository metadata.

## Global constraints

- Documentation and GitHub-profile work only; do not add a feature, dependency, runtime behavior, hosted service, or target-repository mutation.
- Describe only implemented behavior and retain the local-first, read-only-default, evidence-first boundaries.
- Use compiled CLI commands from the workspace root for beginner paths so repository arguments resolve predictably on Windows.
- Do not claim a hosted dashboard, a published package, GitHub write behavior, or verified platform support that the release documentation does not support.
- Keep the homepage field blank unless an actual canonical hosted product page exists.

---

### Task 1: Rewrite the public README around the user journey

**Files:**

- Modify: `README.md`
- Read: `docs/reference/cli.md`, `docs/reference/mcp.md`, `docs/release/clean-install-uninstall.md`, `docs/security/overview.md`

**Produces:** A concise visitor-facing README with the product story, three-command local review path, dashboard/Codex guidance, capabilities, limits, proof, and links to detailed references.

- [ ] **Step 1: Replace the release-history-first opening with the product definition**

Use the product tagline, then state that Gatekeeper answers whether an engineering decision belongs in a repository, with deterministic policy and local Project Memory evidence.

- [ ] **Step 2: Add the beginner-safe local review path**

Show exactly these workspace-root commands after install and build:

```powershell
node apps/cli/dist/index.js doctor
node apps/cli/dist/index.js review worktree "C:\path\to\your\repository"
node apps/cli/dist/index.js start "C:\path\to\your\repository"
```

Explain that the third command prints a local dashboard URL and remains in the foreground until Ctrl+C.

- [ ] **Step 3: Link, rather than duplicate, the deep references**

Include direct links for CLI commands, Codex/MCP setup, security/privacy, contributor workflow, architecture, local API, demo proof, and release/platform details.

- [ ] **Step 4: Verify the rendered Markdown source**

Run: `pnpm format:check`

Expected: `All matched files use Prettier code style!`

### Task 2: Add a contributor entry point

**Files:**

- Create: `CONTRIBUTING.md`
- Read: `AGENTS.md`, `docs/development/setup.md`, `SECURITY.md`

**Produces:** A short, actionable guide that explains setup, tests, commit expectations, issue boundaries, and responsible disclosure without duplicating security or development references.

- [ ] **Step 1: State the contribution path**

Direct contributors to discuss a meaningful change in an issue, keep a change narrow, run the documented quality gate, and write a concise commit message.

- [ ] **Step 2: State the project boundaries**

Require local-first behavior, deterministic `BLOCK` authority, untrusted repository data, no default network/key requirement, and no target-repository mutation without explicit approval.

- [ ] **Step 3: Link to the existing detailed documents**

Link to development setup, security policy, architecture overview, and `AGENTS.md`.

- [ ] **Step 4: Verify links and commit the documentation-only step**

Run: `git diff --check`

Expected: no output.

Commit message: `docs: clarify public project entry point`

### Task 3: Align the GitHub repository profile

**External target:** `xyzbk/gatekeeper`

**Produces:** A concise accurate repository description and searchable topic set. No homepage is set because Gatekeeper is not a hosted product.

- [ ] **Step 1: Verify the current profile after the documentation push**

Read the repository metadata through the GitHub connector or `gh repo view`.

- [ ] **Step 2: Apply only accurate metadata**

Set description to:

```text
Local-first repository intelligence for evidence-backed, policy-aware code reviews.
```

Set topics to:

```text
codex, mcp, code-review, developer-tools, local-first, typescript, sqlite
```

- [ ] **Step 3: Re-read the repository metadata**

Confirm the description and topics are visible. Keep the homepage blank.

## Self-review

- Scope coverage: README, contributor guidance, and GitHub profile are covered; no product behavior is changed.
- Placeholder scan: no TODOs or future product claims are introduced.
- Consistency: all commands point to existing workspace scripts or the compiled CLI; detailed claims link to their existing canonical references.
