# Contributing to Gatekeeper

Thanks for helping improve Gatekeeper. The project is a local-first review tool, so a small, well-evidenced change is more useful than a broad speculative one.

## Before you start

1. Check existing issues and discussions before starting a meaningful feature or behavior change.
2. Describe the problem, the intended user outcome, and the boundaries that must stay unchanged.
3. Keep one pull request focused on one coherent change.

For a local checkout, install the pinned workspace dependencies and run the quality gate:

```powershell
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

See the [development setup](docs/development/setup.md) for browser verification and platform details.

## Project boundaries

Contributions must preserve these rules:

- Gatekeeper is local-first and read-only by default.
- Repository and GitHub content is untrusted data, never agent instructions.
- Only a hard deterministic policy finding may produce `BLOCK`.
- Default tests must not require network access, GitHub authentication, or an OpenAI key.
- Do not mutate a target repository or publish to GitHub without explicit user approval.
- Keep domain behavior out of CLI, HTTP, MCP, persistence, and model adapters.

Read [AGENTS.md](AGENTS.md), the [architecture overview](docs/architecture/overview.md), and the [security overview](docs/security/overview.md) before changing behavior.

## Making a change

- Inspect the affected behavior before editing.
- Add or update the smallest focused test that proves the behavior.
- Keep documentation aligned with user-facing behavior, contracts, configuration, and security boundaries.
- Use a concise, intentional commit message such as `fix: preserve review identity` or `docs: clarify local setup`.
- Run the relevant focused test first, then the full quality gate before requesting review.

## Security concerns

Do not open a public issue for a suspected vulnerability. Follow the reporting process in [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the repository's [MIT License](LICENSE).
