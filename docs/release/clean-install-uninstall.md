# Clean install and uninstall

## Clean install

Requirements: Node.js 24, pnpm 11, and Git. `gh` is not needed for the local judge path.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm demo:smoke
pnpm eval
pnpm model-data:dry-run
```

The smoke command proves all six golden verdicts without a GitHub credential, external network request, or model call after dependencies are installed. `pnpm eval` regenerates the checked-in golden report.

## Supported platforms

Windows is the verified desktop platform. The application uses Node.js, SQLite, Git, and standard loopback HTTP; the non-browser workspace gate also has existing Ubuntu CI coverage. macOS and a full browser release run were not independently performed, so they are not claimed as verified platforms.

## Uninstall and local data

Gatekeeper has no installer, background service, global package, or target-repository state. Stop a foreground process with Ctrl+C, then remove its machine-local app-data directory only if its Project Memory and service metadata should be erased:

- Windows: `%LOCALAPPDATA%\Gatekeeper`
- macOS: `~/Library/Application Support/Gatekeeper`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/gatekeeper`

Removing that directory deletes local SQLite Project Memory and ephemeral service metadata. It does not alter a reviewed repository, its Git history, GitHub content, or `.gatekeeper` policy files.

## Verification record

On Windows, a fresh detached checkout passed `pnpm install --frozen-lockfile`, `pnpm build`, and `pnpm demo:smoke` on 2026-07-19. The install resolved the pinned 400-package workspace without changing the lockfile; the smoke matrix produced all six expected verdicts. No package was published or installed globally.
