# Development setup

## Requirements

- Node.js 24 LTS
- pnpm 11.9.x
- Git
- `gh` is optional until GitHub integration

## Install and verify

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm playwright test
```

All dependency versions are pinned in `pnpm-lock.yaml`. pnpm is configured to allow the lifecycle script for `esbuild` only; arbitrary dependency build scripts remain denied.

## CLI

```bash
pnpm --filter @gatekeeper/cli start -- --version
pnpm --filter @gatekeeper/cli start -- --help
pnpm --filter @gatekeeper/cli start -- doctor
pnpm --filter @gatekeeper/cli start -- doctor --format json
```

Doctor checks Node 24, pnpm, Git, optional `gh`, and a writable per-user app-data path. It does not authenticate or access the network.

## Test-first workflow

Write one failing behavior test, confirm the expected failure, implement the minimum passing behavior, then run the affected test and the full quality gate. Unit and integration tests live beside source and are excluded from package build output. The browser acceptance lives under `tests/e2e`, builds on the real local service and Ghost Change fixture, and requires the Playwright Chromium browser once per development environment.

## Platform status

Phases 0 through 6 are developed and verified on Windows. CI verifies the root non-browser commands on Ubuntu; the Playwright Ghost Change acceptance is currently a local release gate. Full cross-platform packaging remains deferred to final hardening.
