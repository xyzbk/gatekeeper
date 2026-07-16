# Local API reference

Phase 1 exposes a deliberately small HTTP surface from the foreground Gatekeeper process.

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

Phase 1 uses `USAGE_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, and `INTERNAL_ERROR` as applicable. Responses never include stacks, subprocess output, tokens, repository content, or rejected input values.
