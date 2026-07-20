import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
  reviewOperationSchema,
  type DashboardBootstrap,
  type RepositorySnapshot,
} from '@gatekeeper/contracts';
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
          reviewId: context.reviewId,
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
      const dashboardMemory = createMemoryClient(fetch, () => Promise.resolve(bootstrap));
      const startReview = async () => {
        const response = await fetch(`${first.baseUrl}/v1/reviews/pull-request/start`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${first.bearerToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            schemaVersion: 1,
            pullRequestNumber: fixture.pullRequestNumber,
          }),
        });
        const started = reviewOperationSchema.parse(await response.json());
        expect(response.status).toBe(202);
        await expect
          .poll(async () => {
            const polled = await fetch(`${first.baseUrl}/v1/reviews/${started.reviewId}`, {
              headers: { authorization: `Bearer ${first.bearerToken}` },
            });
            return reviewOperationSchema.parse(await polled.json()).status;
          })
          .toBe('completed');
        const completed = await fetch(`${first.baseUrl}/v1/reviews/${started.reviewId}`, {
          headers: { authorization: `Bearer ${first.bearerToken}` },
        });
        const operation = reviewOperationSchema.parse(await completed.json());
        if (operation.status !== 'completed') {
          throw new Error('Expected the Ghost Change review operation to complete.');
        }
        return operation;
      };
      const firstResult = await startReview();
      expect(firstResult.review.verdict).toBe('ESCALATE');
      expect(firstResult.historySync).toMatchObject({
        partial: true,
        documents: { written: 9 },
      });
      expect(firstResult.previousReview).toBeNull();
      expect(firstResult.evidenceTimeline.map(({ role }) => role)).toEqual([
        'proposal',
        'implementation',
        'incident',
        'revert',
        'decision',
        'revived_change',
      ]);
      expect(firstResult.evidenceTimeline.map(({ sourceAuthority }) => sourceAuthority)).toEqual([
        'github',
        'github',
        'github',
        'github',
        'repository',
        'github',
      ]);
      expect(
        firstResult.evidenceTimeline.find(({ role }) => role === 'implementation')?.status,
      ).toBe('superseded');
      expect(
        firstResult.evidenceTimeline.every(({ href }) => href?.startsWith('https://github.com/')),
      ).toBe(true);

      const secondResult = await startReview();
      expect(secondResult.previousReview?.reviewId).toBe(firstResult.review.reviewId);

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
      expect(draft.previousReviewId).toBe(secondResult.review.reviewId);
      expect(draft.evidenceCandidates.map(({ sourceId }) => sourceId)).toEqual(
        expect.arrayContaining([
          'issue:#4',
          'pull_request:#8',
          'issue:#9',
          'pull_request:#10',
          'docs/adr/0003-no-required-redis.md',
        ]),
      );
      const activeAdr = draft.evidenceCandidates.find(
        ({ sourceId }) => sourceId === 'docs/adr/0003-no-required-redis.md',
      );
      expect(activeAdr).toBeDefined();
      const completed = await mcpClient.completeReview({
        reviewId: draft.reviewId,
        findings: [
          {
            id: 'finding:architecture-history:required-redis-conflicts-with-active-adr',
            category: 'architecture-history',
            severity: 'high',
            authority: 'EVIDENCE_SUPPORTED',
            confidence: 0.95,
            title: 'Required Redis conflicts with the active ADR',
            explanation: 'The active ADR keeps Redis optional and SQLite durable.',
            evidence: [activeAdr!],
            affectedPaths: ['src/cache.ts'],
            remediation: ['Keep Redis optional and use SQLite for durable local storage.'],
            falsePositiveRisk: 'low',
            humanApprovalRequired: true,
          },
        ],
        model: 'gpt-5.6-codex',
      });
      expect(completed.verdict).toBe('ESCALATE');
      expect(completed.verdict).not.toBe('BLOCK');
      expect(completed.reasoningProvider).toBe('codex');
      expect(completed.model).toBe('gpt-5.6-codex');
      expect(completed.findings).toContainEqual(
        expect.objectContaining({
          authority: 'EVIDENCE_SUPPORTED',
          evidence: [activeAdr],
          id: 'finding:architecture-history:required-redis-conflicts-with-active-adr',
        }),
      );

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
