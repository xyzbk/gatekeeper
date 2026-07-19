# Local API reference

Gatekeeper exposes a deliberately small HTTP surface from the foreground process.

Build the workspace, then start the foreground service for exactly one repository:

```bash
pnpm --filter @gatekeeper/cli start -- start .
```

The CLI prints the selected root and random loopback URL. Ctrl+C closes Fastify and removes the ephemeral service metadata file.

Only one Gatekeeper foreground service may own machine-local Project Memory at a time. Starting a second service fails safely without replacing the active service's metadata or changing its operations. After a crash, Gatekeeper reclaims a lock only when its recorded process is no longer running; otherwise stop the existing foreground process first.

## Connection

- Bind address: `127.0.0.1` only.
- Port: an available ephemeral port selected by the operating system.
- Authentication: `Authorization: Bearer <token>` for every `/v1/*` request.
- Bootstrap: the same-origin dashboard reads `/bootstrap.json` once and keeps the token in browser memory.
- Metadata: the PID, port, base URL, token, repository root, and start time are written to machine-local `service.json` with restrictive permissions where supported.
- Project Memory: the SQLite database is migrated and the fixed repository is registered before the server listens; Fastify closes before the database on shutdown.

The token must never be copied into a query parameter, local storage, logs, committed configuration, or an error response.

## Endpoints

### `GET /health`

Unauthenticated liveness only:

```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

The health contract intentionally contains no repository identity, path, Git state, token, or machine-local path.

### `GET /bootstrap.json`

Same-origin dashboard bootstrap with `Cache-Control: no-store`:

```json
{
  "apiBaseUrl": "/v1",
  "bearerToken": "<ephemeral base64url token>"
}
```

### `GET /v1/status`

Authenticated service and live status for the repository fixed when the service started. It includes:

- service state, version, start time, and loopback URL;
- repository root, branch, HEAD, dirty state, and origin;
- Git and `gh` availability;
- disabled model reasoning and ready Project Memory state;
- app-data, service-metadata, and storage paths.

This endpoint accepts no path, query, body, or repository selector. Unknown query fields are rejected with `USAGE_ERROR`. If the current Git root or normalized `origin` remote no longer matches the fixed service identity, it fails safely rather than reading, indexing, or reviewing another repository under the original Project Memory record.

### `POST /v1/reviews/worktree`

Runs the deterministic review for the repository fixed when the service started.

Requirements:

- bearer authentication;
- `Content-Type: application/json`;
- exactly an empty JSON object, `{}`;
- no query fields and no repository/path selector.

The `200` response is the same strict ReviewRun v1 returned by `gatekeeper review worktree --format json`. It contains the verdict, deterministic findings, metrics, and bounded change summaries. It does not contain source text, inspected added lines, or raw diff content.

The service persists the review transaction before responding. Re-reviewing the same worktree target attaches the latest stored review as `previousReviewId`.

```json
{
  "schemaVersion": 1,
  "reviewId": "review_<opaque>",
  "repositoryId": "repository_<opaque>",
  "target": { "kind": "worktree", "display": "Current worktree" },
  "verdict": "FAST_PATH",
  "summary": "FAST_PATH: 1 changed file, 0 deterministic findings.",
  "findings": [],
  "metrics": {
    "filesChanged": 1,
    "linesAdded": 1,
    "linesDeleted": 1,
    "pathGroups": [{ "name": "src", "count": 1 }]
  },
  "changes": [
    {
      "path": "src/app.ts",
      "status": "modified",
      "additions": 1,
      "deletions": 1,
      "binary": false,
      "contentTruncated": false
    }
  ],
  "createdAt": "2026-07-18T12:00:00.000Z"
}
```

The shortened example omits optional metrics and uses an empty findings array only for readability; consumers must use the contract rather than copy this example as a complete semantic result.

### `POST /v1/reviews/worktree/start`

Starts the same persisted worktree review for the dashboard without holding the HTTP request open. The request requirements are identical to the synchronous worktree endpoint. The `202` response is a strict ReviewOperation v1 with a preallocated review ID and `queued` status. The dashboard polls that ID through `GET /v1/reviews/:reviewId`.

### `POST /v1/reviews/commit` and `/v1/reviews/commit/start`

Review one immutable full local commit SHA, synchronously or as the dashboard operation:

```json
{ "schemaVersion": 1, "sha": "<40-64 lowercase hexadecimal object ID>" }
```

The fixed service repository is the only repository considered. The synchronous endpoint returns ReviewRun v1; the start endpoint returns the existing queued ReviewOperation v1. Gatekeeper compares the selected commit with its first parent (or Git's empty tree for a root commit), uses the current policy and ignore rules, and never checks out, moves a branch, changes the index, or modifies the worktree. Extra fields, ranges, branches, paths, remotes, and malformed SHAs are rejected.

### `POST /v1/reviews/pull-request`

Runs the same deterministic reviewer for one pull request belonging to the fixed service repository:

```json
{
  "schemaVersion": 1,
  "pullRequestNumber": 12
}
```

The pull-request number must be a positive integer. Additional fields—including paths, remotes, repository selectors, tokens, or publication settings—are rejected. The service reads bounded metadata and file changes through authenticated `gh`, verifies the normalized remote still matches the service-start snapshot, records GitHub check state and suspicious instruction-like text as inert evidence, persists the strict ReviewRun v1, and indexes the current pull request in Project Memory before responding. A later review of the same pull-request number receives the prior review ID, including after a service restart.

### `POST /v1/reviews/pull-request/start`

Starts the dashboard pull-request review and returns a strict queued ReviewOperation v1 with `202`. The foreground process first synchronizes bounded GitHub history, then evaluates the change and persists the ReviewRun under the same preallocated ID. This is a caught in-process operation rather than a durable worker queue; if the service stops while it is queued or running, startup converts that operation to a bounded failed state that can be retried.

### `POST /v1/repositories`

Returns the already-registered repository fixed at service start. The request body must be exactly `{}`; no path, remote, or repository selector is accepted.

### `GET /v1/repositories/:repositoryId`

Returns the fixed strict RepositoryRecord v1. Any other repository ID returns `NOT_FOUND` and cannot select another local repository.

### `POST /v1/repositories/:repositoryId/index`

Runs bounded incremental indexing for the fixed repository. The body must be exactly `{}`. The strict IndexResult v1 reports scanned, written, unchanged, and deleted counts for files, evidence documents, and commits.

### `POST /v1/repositories/:repositoryId/sync/github`

Synchronizes bounded GitHub issues, pull requests, comments, and reviews for the fixed repository. The body must be exactly `{}` and any other repository ID returns `NOT_FOUND`. The strict GitHubSyncResult v1 reports document/link counts, partial failures, and the resulting cursor. A partial import is a successful typed result: valid records persist, while the cursor stays unchanged so malformed records can be retried.

This endpoint is read-only with respect to GitHub. It cannot publish comments, checks, labels, branches, commits, merges, closes, or any other remote mutation.

### `GET /v1/repositories/:repositoryId/memory/status`

Returns strict repository and index status. `indexState` is `null` until the first successful index and contains the indexed HEAD and record counts afterward.

### `POST /v1/memory/search`

Accepts strict MemorySearchInput v1 for the fixed repository only:

```json
{
  "schemaVersion": 1,
  "repositoryId": "repository_<opaque>",
  "query": "redis cache",
  "limit": 10
}
```

The query is 1–256 characters and the optional limit is 1–50. Results are bounded EvidencePointers labelled `untrusted_repository_content`; repository content remains data, never instructions. A linked result includes its explicit `relationship` (`mentions`, `implements`, `reverts`, `supersedes`, `caused_by`, or `resolves`) and remains in its stored link position.

### `GET /v1/memory/commits`

Returns at most ten newest indexed commit records for the fixed repository, ordered by authored time then SHA. Each result contains only SHA, authored time, and title; titles are untrusted repository data. The endpoint accepts no selector, query field, commit body, or diff request. It is history evidence, not a repository browser or pagination API.

### `GET /v1/reviews/:reviewId`

Reads one strict ReviewOperation v1 when the ID belongs to a dashboard operation, including after completion; otherwise it reads the legacy strict ReviewRun v1. Operations progress through `queued`, `running`, `failed`, or `completed`, with bounded stages that are safe to display. The completed operation embeds the persisted ReviewRun using the same review ID, the matching previous ReviewRun when available, nullable bounded GitHub synchronization status, and up to fifty ordered evidence-timeline items. Timeline items expose a semantic role, explicit relationship when present, repository or GitHub authority, historical status, the bounded evidence pointer, and only a validated `https://github.com` link. Missing review IDs return `NOT_FOUND`. Reviews and operation state remain available after the foreground service restarts because they live in machine-local Project Memory.

### `GET /v1/reviews/:reviewId/draft`

Prepares the fixed stored worktree review for Codex completion. The strict ReviewDraft v1 preserves deterministic findings and bounded changed-file summaries, then adds up to twenty deduplicated Project Memory evidence candidates retrieved with at most eight derived queries. Returned repository excerpts remain bounded to 2,000 characters and labelled untrusted by the memory-search contract.

Instruction-like text in retrieved evidence is never followed. Gatekeeper adds a deterministic `content-security` finding that cites the suspicious text as data and requires human review.

### `POST /v1/reviews/:reviewId/complete`

Accepts strict model-authored findings and persists the recomputed ReviewRun v1:

```json
{
  "schemaVersion": 1,
  "findings": [
    {
      "id": "finding_optional_cache",
      "category": "architecture-history",
      "severity": "medium",
      "authority": "EVIDENCE_SUPPORTED",
      "confidence": 0.9,
      "title": "The change conflicts with an active ADR",
      "explanation": "The offered ADR requires the cache to remain optional.",
      "evidence": [
        {
          "sourceType": "adr",
          "repositoryId": "repository_<opaque>",
          "sourceId": "docs/adr/0003-cache.md",
          "path": "docs/adr/0003-cache.md",
          "excerpt": "Keep the cache optional."
        }
      ],
      "affectedPaths": ["src/cache.ts"],
      "remediation": ["Keep the cache optional."],
      "falsePositiveRisk": "low",
      "humanApprovalRequired": false
    }
  ],
  "model": "<active Codex model, optional>"
}
```

The request cannot contain a verdict, deterministic authority, policy identity, or enforcement. Evidence-supported findings require at least one exact pointer offered by the draft. Gatekeeper rejects duplicate IDs, cross-repository or forged pointers, and affected paths outside the stored change. It preserves deterministic findings, fixes the reasoning provider to `codex`, assembles the verdict locally, and atomically replaces the stored run. A missing review returns `NOT_FOUND`; invalid completion claims return the stable `USAGE_ERROR` envelope without echoing rejected content.

When the foreground service started with `gatekeeper start --deterministic-only`, this endpoint always returns `403 FORBIDDEN` before interpreting the submitted completion. Deterministic review creation, stored-review reads, Project Memory, and dashboard routes remain available.

## Dashboard routes

The built React application supports direct entry and refresh for these fixed local routes:

- `GET /` — repository overview;
- `GET /reviews/worktree` — interactive worktree review;
- `GET /reviews/pull-request` — explicit read-only history sync and pull-request review;
- `GET /reviews/:reviewId` — one persisted review selected by its validated ID;
- `GET /memory` — Project Memory search for the repository fixed at service startup.

The browser sends the in-memory bootstrap bearer token to the matching fixed-repository APIs. It never accepts a repository path, renders repository content as HTML, or stores the token in persistent browser storage.

## Errors

All controlled API failures use the shared strict envelope:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "A valid local bearer token is required."
  }
}
```

The API uses `USAGE_ERROR`, `ENVIRONMENT_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, and `INTERNAL_ERROR` as applicable. Missing `gh` or authentication returns status `503` with bounded repair guidance. Responses never include stacks, subprocess output, tokens, remote bodies, repository content beyond bounded evidence, diff text, database details, or rejected input values. Failed Project Memory and review operations return a stable internal error; server logs retain only bounded operation metadata.
