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

### One-command evaluator route

For the shortest fresh-clone evaluation, run `pnpm judge`. It runs the pinned install, build, offline smoke proof, and interactive dashboard demo in that order. On Windows, double-click [`Judge Gatekeeper Demo.cmd`](../../Judge%20Gatekeeper%20Demo.cmd) to invoke the same public command. The launcher contains no setup logic of its own.

## Interactive evaluation

After the same install and build, run:

```bash
pnpm demo
```

The command starts the compiled dashboard against a disposable local repository and committed GitHub-response fixture. Open the printed `127.0.0.1` URL, select **Pull requests**, review pull request `12`, and inspect the resulting `ESCALATE` evidence timeline and remediation. No account, credential, source repository, external network request, or model call is needed. `Ctrl+C` stops the foreground process and removes the temporary repository and its Project Memory.

This is the supported hands-on evaluation route for the local developer tool; it avoids asking an evaluator to create data, configure GitHub, or connect a model before seeing a complete review.

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
