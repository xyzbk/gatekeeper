# Local API reference

Phase 2 exposes a deliberately small HTTP surface from the foreground Gatekeeper process.

Build the workspace, then start the foreground service for exactly one repository:

```bash
pnpm --filter @gatekeeper/cli start -- start .
```

The CLI prints the selected root and random loopback URL. Ctrl+C closes Fastify and removes the ephemeral service metadata file.

## Connection

- Bind address: `127.0.0.1` only.
- Port: an available ephemeral port selected by the operating system.
- Authentication: `Authorization: Bearer <token>` for every `/v1/*` request.
- Bootstrap: the same-origin dashboard reads `/bootstrap.json` once and keeps the token in browser memory.
- Metadata: the PID, port, base URL, token, repository root, and start time are written to machine-local `service.json` with restrictive permissions where supported.

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

Authenticated service and fixed-repository status. It includes:

- service state, version, start time, and loopback URL;
- repository root, branch, HEAD, dirty state, and origin;
- Git and `gh` availability;
- disabled model-reasoning and uninitialized Project Memory states;
- app-data, service-metadata, and future storage paths.

This endpoint accepts no path, query, body, or repository selector. Unknown query fields are rejected with `USAGE_ERROR`.

### `POST /v1/reviews/worktree`

Runs the deterministic review for the repository fixed when the service started.

Requirements:

- bearer authentication;
- `Content-Type: application/json`;
- exactly an empty JSON object, `{}`;
- no query fields and no repository/path selector.

The `200` response is the same strict ReviewRun v1 returned by `gatekeeper review worktree --format json`. It contains the verdict, deterministic findings, metrics, and bounded change summaries. It does not contain source text, inspected added lines, or raw diff content.

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

## Dashboard routes

`GET /` serves the repository overview. `GET /reviews/worktree` serves the same built React application so the Review Inspector can be opened or refreshed directly. The browser posts `{}` only after the user selects Run worktree review. Results remain in page memory and disappear with the foreground process/page lifecycle.

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

Phase 2 uses `USAGE_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, and `INTERNAL_ERROR` as applicable. Responses never include stacks, subprocess output, tokens, repository content, diff text, or rejected input values. A failed worktree review returns a stable internal error; server logs retain only bounded operation metadata.
