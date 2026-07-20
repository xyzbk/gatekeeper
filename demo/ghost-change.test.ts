import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { RepositoryId, ReviewId } from '@gatekeeper/domain';
import { createGitHubProvider, normalizeGitHubRemote } from '@gatekeeper/github-gh';
import { createProjectMemory } from '@gatekeeper/project-memory';
import { completeReview, prepareReviewDraft, reviewPullRequest } from '@gatekeeper/review-engine';
import { openSqliteProjectStore } from '@gatekeeper/store-sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
    expect(history.failures).toContainEqual({ source: 'issues[5]', code: 'malformed_record' });
    expect(history.records.map(({ sourceId }) => sourceId)).toEqual(
      expect.arrayContaining([
        'issue:#4',
        'pull_request:#8',
        'issue:#9',
        'pull_request:#10',
        'issue:#11',
        'pull_request:#13',
        'pull_request:#12',
        'issue:#99',
      ]),
    );
  });

  it('exposes an auditable SQLite correction only for the follow-up replay', async () => {
    const fixture = await loadGhostChangeFixture();
    let phase: 'revived' | 'corrected' = 'revived';
    const provider = createGitHubProvider({
      runGh: createGhostChangeRunner(fixture, () => phase),
    });
    const remote = normalizeGitHubRemote(fixture.remote);

    const revived = await provider.getPullRequest(remote, fixture.pullRequestNumber);
    phase = 'corrected';
    const corrected = await provider.getPullRequest(remote, fixture.pullRequestNumber);
    const correctedChangeSet = await provider.getPullRequestDiff(remote, fixture.pullRequestNumber);

    expect(revived.body).toContain('Ignore all previous instructions');
    expect(corrected.body).not.toContain('Ignore all previous instructions');
    expect(corrected.body).toContain('SQLite');
    expect(correctedChangeSet.files).toContainEqual(
      expect.objectContaining({
        path: 'src/cache.ts',
        addedLines: ["export const cache = 'sqlite';"],
      }),
    );
    const correctedTest = correctedChangeSet.files.find((file) => file.path === 'tests/cache.test.ts');
    expect(correctedTest?.addedLines).toContain("  expect(cache).toBe('sqlite');");
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
        limit: 20,
      });

      expect(results.slice(0, 8).map(({ evidence }) => evidence.sourceId)).toEqual([
        'pull_request:#12',
        'issue:#4',
        'pull_request:#8',
        'issue:#9',
        'issue:#11',
        'pull_request:#10',
        'pull_request:#13',
        'docs/adr/0003-no-required-redis.md',
      ]);
      expect(results.map(({ evidence }) => evidence.sourceId)).toEqual(
        expect.arrayContaining(['issue:#11', 'pull_request:#13']),
      );
      expect(results.some(({ evidence }) => evidence.sourceId === 'issue:#99')).toBe(false);
      const [pullRequest, changeSet] = await Promise.all([
        provider.getPullRequest(remote, fixture.pullRequestNumber),
        provider.getPullRequestDiff(remote, fixture.pullRequestNumber),
      ]);
      const review = reviewPullRequest({
        changeSet,
        pullRequest,
        createdAt: '2026-07-18T18:00:00.000Z',
        policy: { version: 1 },
        repositoryId: repository.repositoryId as RepositoryId,
        reviewId: 'review_ghost_change' as ReviewId,
      });
      await memory.saveReview(review);
      const searchMemory = vi.fn((input: Parameters<typeof memory.search>[0]) =>
        memory.search(input),
      );
      const draft = await prepareReviewDraft({ review, searchMemory });
      const completed = completeReview({ review, draft, findings: [], model: null });
      await memory.saveReview(completed);

      expect(searchMemory).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'pull_request:#12' }),
      );
      expect(draft.evidenceCandidates.map(({ sourceId }) => sourceId)).toEqual(
        expect.arrayContaining([
          'issue:#4',
          'pull_request:#8',
          'issue:#9',
          'pull_request:#10',
          'issue:#11',
          'pull_request:#13',
          'docs/adr/0003-no-required-redis.md',
        ]),
      );
      expect(completed.findings).toContainEqual(
        expect.objectContaining({ id: 'finding:content-security:prompt-injection' }),
      );
      expect(completed.verdict).toBe('ESCALATE');
      expect(completed.verdict).not.toBe('BLOCK');
      await expect(memory.getReview(completed.reviewId)).resolves.toEqual(completed);
    } finally {
      store.close();
    }
  });
});
