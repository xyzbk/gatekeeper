import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { RepositoryId, ReviewId } from '@gatekeeper/domain';
import { createGitHubProvider, normalizeGitHubRemote } from '@gatekeeper/github-gh';
import { createProjectMemory } from '@gatekeeper/project-memory';
import { reviewPullRequest } from '@gatekeeper/review-engine';
import { openSqliteProjectStore } from '@gatekeeper/store-sqlite';
import { afterEach, describe, expect, it } from 'vitest';

import { createGhostChangeRunner, loadGhostChangeFixture } from './ghost-change-fixture.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'gatekeeper-ghost-change-'));
  temporaryRoots.push(root);
  return root;
}

describe('Ghost Change offline scenario', () => {
  it('normalizes the raw fixture through the production GitHub provider', async () => {
    const fixture = await loadGhostChangeFixture();
    const provider = createGitHubProvider({ runGh: createGhostChangeRunner(fixture) });
    const remote = normalizeGitHubRemote(fixture.remote);

    await expect(provider.preflight(remote)).resolves.toMatchObject({ authenticated: true });
    const pullRequest = await provider.getPullRequest(remote, fixture.pullRequestNumber);
    const changeSet = await provider.getPullRequestDiff(remote, fixture.pullRequestNumber);
    const history = await provider.listHistoricalDocuments(remote);

    expect(pullRequest).toMatchObject({ checks: 'pass', state: 'OPEN' });
    expect(changeSet.files.map(({ path }) => path)).toEqual([
      'src/cache.ts',
      'tests/cache.test.ts',
    ]);
    expect(history.partial).toBe(true);
    expect(history.failures).toContainEqual({ source: 'issues[4]', code: 'malformed_record' });
    expect(history.records.map(({ sourceId }) => sourceId)).toEqual(
      expect.arrayContaining([
        'issue:#4',
        'pull_request:#8',
        'issue:#9',
        'pull_request:#10',
        'pull_request:#12',
        'issue:#99',
      ]),
    );
  });

  it('ranks the linked proposal, regression, revert, and active ADR ahead of lexical noise', async () => {
    const fixture = await loadGhostChangeFixture();
    const provider = createGitHubProvider({ runGh: createGhostChangeRunner(fixture) });
    const remote = normalizeGitHubRemote(fixture.remote);
    const root = await temporaryRoot();
    const store = openSqliteProjectStore({ databasePath: join(root, 'memory.db') });
    const memory = createProjectMemory({
      persistence: store,
      git: {
        inspectRepository: () =>
          Promise.resolve({
            root,
            branch: 'master',
            head: 'a'.repeat(40),
            dirty: false,
            remote: fixture.remote,
          }),
        listTrackedFiles: () =>
          Promise.resolve([
            {
              path: 'docs/adr/0003-no-required-redis.md',
              objectId: 'b'.repeat(40),
              mode: '100644',
              sizeBytes: 150,
            },
          ]),
        listCommits: () => Promise.resolve([]),
        readFileAtRef: () =>
          Promise.resolve(
            '# No required Redis\n\nStatus: active\n\nSQLite remains the durable local store.',
          ),
      },
      now: () => '2026-07-18T18:00:00.000Z',
    });

    try {
      await memory.migrate();
      const repository = await memory.registerRepository({ root, remote: fixture.remote });
      await memory.indexLocalRepository({ repositoryId: repository.repositoryId });
      await memory.indexRemoteDocuments({
        repositoryId: repository.repositoryId,
        provider: 'github',
        batch: await provider.listHistoricalDocuments(remote),
      });

      const results = await memory.search({
        schemaVersion: 1,
        repositoryId: repository.repositoryId,
        query: `pull_request:#${fixture.pullRequestNumber}`,
        limit: 10,
      });

      expect(results.slice(0, 6).map(({ evidence }) => evidence.sourceId)).toEqual([
        'pull_request:#12',
        'issue:#4',
        'pull_request:#8',
        'issue:#9',
        'pull_request:#10',
        'docs/adr/0003-no-required-redis.md',
      ]);
      expect(results.some(({ evidence }) => evidence.sourceId === 'issue:#99')).toBe(false);
    } finally {
      store.close();
    }
  });

  it('treats hostile PR prose as evidence, escalates, and never lets it produce BLOCK', async () => {
    const fixture = await loadGhostChangeFixture();
    const provider = createGitHubProvider({ runGh: createGhostChangeRunner(fixture) });
    const remote = normalizeGitHubRemote(fixture.remote);
    const [pullRequest, changeSet] = await Promise.all([
      provider.getPullRequest(remote, fixture.pullRequestNumber),
      provider.getPullRequestDiff(remote, fixture.pullRequestNumber),
    ]);

    const review = reviewPullRequest({
      changeSet,
      pullRequest,
      createdAt: '2026-07-18T18:00:00.000Z',
      policy: { version: 1 },
      repositoryId: 'repository_ghost_change' as RepositoryId,
      reviewId: 'review_ghost_change' as ReviewId,
    });

    expect(review.findings).toContainEqual(
      expect.objectContaining({ id: 'finding:content-security:prompt-injection' }),
    );
    expect(review.verdict).toBe('ESCALATE');
    expect(review.verdict).not.toBe('BLOCK');
  });
});
