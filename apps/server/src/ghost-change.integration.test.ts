import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type { DashboardBootstrap, RepositorySnapshot } from '@gatekeeper/contracts';
import type { ReviewId } from '@gatekeeper/domain';
import { createGitHubProvider, normalizeGitHubRemote } from '@gatekeeper/github-gh';
import { reviewPullRequest } from '@gatekeeper/review-engine';
import { describe, expect, it } from 'vitest';

import { createMemoryClient } from '../../dashboard/src/api/memory-client.js';
import { createReviewClient } from '../../dashboard/src/api/review-client.js';
import { createGatekeeperClient } from '../../mcp-server/src/client.js';
import {
  createGhostChangeRunner,
  loadGhostChangeFixture,
} from '../../../demo/ghost-change-fixture.js';
import { startGatekeeperService } from './service.js';

const execFileAsync = promisify(execFile);

async function runGit(root: string, arguments_: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', [...arguments_], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1_024 * 1_024,
    windowsHide: true,
  });
  return result.stdout.trim();
}

describe('Ghost Change service integration', () => {
  it('flows through dashboard, API, MCP completion, SQLite restart, and linked memory', async () => {
    const fixture = await loadGhostChangeFixture();
    const root = await mkdtemp(join(tmpdir(), 'gatekeeper-ghost-service-'));
    const appData = join(root, 'app-data');
    const repositoryRoot = join(root, 'repository');
    const dashboardRoot = join(root, 'dashboard');
    const paths = {
      appData,
      serviceMetadata: join(appData, 'service.json'),
      storage: join(appData, 'storage'),
    };
    await mkdir(join(repositoryRoot, 'docs', 'adr'), { recursive: true });
    await mkdir(join(repositoryRoot, '.gatekeeper'), { recursive: true });
    await mkdir(dashboardRoot, { recursive: true });
    await writeFile(join(dashboardRoot, 'index.html'), '<main>Gatekeeper dashboard</main>', 'utf8');
    await writeFile(join(repositoryRoot, '.gatekeeper', 'policies.yaml'), 'version: 1\n', 'utf8');
    await writeFile(
      join(repositoryRoot, 'docs', 'adr', '0003-no-required-redis.md'),
      '# No required Redis\n\nStatus: active\n\nRedis cache stays optional; SQLite is durable.\n',
      'utf8',
    );
    await runGit(repositoryRoot, ['init', '--initial-branch=master']);
    await runGit(repositoryRoot, ['config', 'user.email', 'gatekeeper@example.invalid']);
    await runGit(repositoryRoot, ['config', 'user.name', 'Gatekeeper Integration']);
    await runGit(repositoryRoot, ['remote', 'add', 'origin', fixture.remote]);
    await runGit(repositoryRoot, ['add', '--all']);
    await runGit(repositoryRoot, ['commit', '--message', 'record active Redis decision']);

    const repository: RepositorySnapshot = {
      root: repositoryRoot,
      branch: 'master',
      head: await runGit(repositoryRoot, ['rev-parse', 'HEAD']),
      dirty: false,
      remote: fixture.remote,
    };
    const github = createGitHubProvider({ runGh: createGhostChangeRunner(fixture) });
    const remote = normalizeGitHubRemote(fixture.remote);
    let reviewSequence = 0;
    const runReview: Parameters<typeof startGatekeeperService>[0]['reviewPullRequest'] = async (
      pullRequestNumber,
      context,
    ) => {
      await github.preflight(remote);
      const [pullRequest, changeSet] = await Promise.all([
        github.getPullRequest(remote, pullRequestNumber),
        github.getPullRequestDiff(remote, pullRequestNumber),
      ]);
      reviewSequence += 1;
      return {
        pullRequest,
        remote,
        review: reviewPullRequest({
          changeSet,
          pullRequest,
          createdAt: `2026-07-18T18:0${reviewSequence}:00.000Z`,
          policy: { version: 1 },
          repositoryId: context.repositoryId,
          reviewId: `review_ghost_service_${reviewSequence}` as ReviewId,
          ...(context.previousReviewId === undefined
            ? {}
            : { previousReviewId: context.previousReviewId }),
        }),
      };
    };
    const serviceOptions: Parameters<typeof startGatekeeperService>[0] = {
      bearerToken: 'g'.repeat(43),
      dashboardRoot,
      githubProvider: github,
      logger: false,
      paths,
      repository,
      reviewPullRequest: runReview,
      reviewWorktree: () => Promise.reject(new Error('Not exercised by Ghost Change.')),
      startedAt: '2026-07-18T18:00:00.000Z',
      tools: {
        git: { available: true, version: 'fixture' },
        gh: { available: true, version: 'fixture' },
      },
      version: '0.1.0',
    };
    let first = await startGatekeeperService(serviceOptions);

    try {
      const loadMetadata = async () =>
        JSON.parse(await readFile(paths.serviceMetadata, 'utf8')) as unknown;
      let mcpClient = createGatekeeperClient({ loadMetadata });
      await expect(mcpClient.indexRepository()).resolves.toMatchObject({
        documents: { written: 3 },
      });

      const bootstrap: DashboardBootstrap = {
        apiBaseUrl: `${first.baseUrl}/v1`,
        bearerToken: first.bearerToken,
      };
      const dashboardReview = createReviewClient(fetch, () => Promise.resolve(bootstrap));
      const dashboardMemory = createMemoryClient(fetch, () => Promise.resolve(bootstrap));
      const firstResult = await dashboardReview.reviewPullRequest(fixture.pullRequestNumber);
      expect(firstResult.sync).toMatchObject({ partial: true, documents: { written: 9 } });
      expect(firstResult.review.verdict).toBe('ESCALATE');

      const memory = await dashboardMemory.search('pull_request:#12');
      expect(memory.slice(0, 6).map(({ evidence }) => evidence.sourceId)).toEqual([
        'pull_request:#12',
        'issue:#4',
        'pull_request:#8',
        'issue:#9',
        'pull_request:#10',
        'docs/adr/0003-no-required-redis.md',
      ]);

      const draft = await mcpClient.reviewPullRequest(fixture.pullRequestNumber);
      expect(draft.previousReviewId).toBe(firstResult.review.reviewId);
      expect(draft.evidenceCandidates.map(({ sourceId }) => sourceId)).toEqual(
        expect.arrayContaining([
          'issue:#4',
          'pull_request:#8',
          'issue:#9',
          'pull_request:#10',
          'docs/adr/0003-no-required-redis.md',
        ]),
      );
      const completed = await mcpClient.completeReview({
        reviewId: draft.reviewId,
        findings: [],
        model: null,
      });
      expect(completed.verdict).toBe('ESCALATE');
      expect(completed.verdict).not.toBe('BLOCK');

      const forged = await fetch(`${first.baseUrl}/v1/reviews/${completed.reviewId}/complete`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${first.bearerToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ schemaVersion: 1, findings: [], verdict: 'BLOCK' }),
      });
      expect(forged.status).toBe(400);
      await first.close();

      first = await startGatekeeperService({
        ...serviceOptions,
        startedAt: '2026-07-18T19:00:00.000Z',
      });
      mcpClient = createGatekeeperClient({ loadMetadata });
      await expect(mcpClient.getReview(completed.reviewId)).resolves.toEqual(completed);
      const restartedBootstrap: DashboardBootstrap = {
        apiBaseUrl: `${first.baseUrl}/v1`,
        bearerToken: first.bearerToken,
      };
      await expect(
        createReviewClient(fetch, () => Promise.resolve(restartedBootstrap)).getReview(
          completed.reviewId,
        ),
      ).resolves.toEqual(completed);
    } finally {
      await first.close().catch(() => undefined);
      await rm(root, { force: true, recursive: true });
    }
  });
});
