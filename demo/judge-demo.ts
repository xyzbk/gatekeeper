import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
  repositoryRecordSchema,
  pullRequestExplorerResponseSchema,
  reviewOperationSchema,
  type RepositorySnapshot,
  type ReviewOperationContract,
} from '../packages/contracts/src/index.js';
import { createGitHubProvider, normalizeGitHubRemote } from '../packages/github-gh/src/index.js';
import { reviewPullRequest } from '../packages/review-engine/src/index.js';

import { startGatekeeperService } from '../apps/server/src/service.js';
import {
  createGhostChangeRunner,
  loadGhostChangeFixture,
  type GhostChangePhase,
} from './ghost-change-fixture.js';

const execFileAsync = promisify(execFile);

export interface JudgeDemoOptions {
  dashboardRoot?: string;
}

export interface RunningJudgeDemo {
  root: string;
  baseUrl: string;
  bearerToken: string;
  githubTransport: 'fixture';
  initialReviewId: string;
  modelCalls: 0;
  close: () => Promise<void>;
}

export interface JudgeDemoSmokeResult {
  githubTransport: 'fixture';
  modelCalls: 0;
  historicalPullRequestNumbers: number[];
  initialReviewId: string;
  initialVerdict: 'ESCALATE';
  correctedVerdict: 'FAST_PATH';
  correctedPreviousReviewId: string;
  evidenceIds: string[];
  correctedFindingIds: string[];
}

async function runGit(root: string, arguments_: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', [...arguments_], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1_024 * 1_024,
    timeout: 30_000,
    windowsHide: true,
  });
  return result.stdout.trim();
}

async function createJudgeRepository(root: string, remote: string): Promise<RepositorySnapshot> {
  const repositoryRoot = join(root, 'repository');
  await mkdir(join(repositoryRoot, '.gatekeeper'), { recursive: true });
  await mkdir(join(repositoryRoot, 'docs', 'adr'), { recursive: true });
  await writeFile(join(repositoryRoot, '.gatekeeper', 'policies.yaml'), 'version: 1\n', 'utf8');
  await writeFile(
    join(repositoryRoot, 'docs', 'adr', '0003-no-required-redis.md'),
    '# No required Redis\n\nStatus: active\n\nRedis cache stays optional; SQLite is durable.\n',
    'utf8',
  );
  await runGit(repositoryRoot, ['init', '--initial-branch=master']);
  await runGit(repositoryRoot, ['config', 'user.email', 'gatekeeper@example.invalid']);
  await runGit(repositoryRoot, ['config', 'user.name', 'Gatekeeper Judge Demo']);
  await runGit(repositoryRoot, ['remote', 'add', 'origin', remote]);
  await runGit(repositoryRoot, ['add', '--all']);
  await runGit(repositoryRoot, ['commit', '--message', 'record active Redis decision']);

  return {
    root: repositoryRoot,
    branch: 'master',
    head: await runGit(repositoryRoot, ['rev-parse', 'HEAD']),
    dirty: false,
    remote,
  };
}

function defaultDashboardRoot(): string {
  return fileURLToPath(new URL('../apps/dashboard/dist', import.meta.url));
}

export async function startJudgeDemo(options: JudgeDemoOptions = {}): Promise<RunningJudgeDemo> {
  const fixture = await loadGhostChangeFixture();
  const root = await mkdtemp(join(tmpdir(), 'gatekeeper-judge-demo-'));
  let service: Awaited<ReturnType<typeof startGatekeeperService>> | undefined;

  try {
    const repository = await createJudgeRepository(root, fixture.remote);
    let phase: GhostChangePhase = 'revived';
    const github = createGitHubProvider({ runGh: createGhostChangeRunner(fixture, () => phase) });
    const remote = normalizeGitHubRemote(fixture.remote);
    const paths = {
      appData: join(root, 'app-data'),
      serviceMetadata: join(root, 'app-data', 'service.json'),
      storage: join(root, 'app-data', 'storage'),
    };
    const activeService = await startGatekeeperService({
      allowExternalEvidenceLinks: false,
      dashboardRoot: options.dashboardRoot ?? defaultDashboardRoot(),
      deterministicOnly: true,
      githubProvider: github,
      logger: false,
      paths,
      repository,
      reviewPullRequest: async (pullRequestNumber, context) => {
        await github.preflight(remote);
        const [pullRequest, changeSet] = await Promise.all([
          github.getPullRequest(remote, pullRequestNumber),
          github.getPullRequestDiff(remote, pullRequestNumber),
        ]);
        return {
          pullRequest,
          remote,
          review: reviewPullRequest({
            changeSet,
            pullRequest,
            createdAt:
              phase === 'revived' ? '2026-07-19T12:00:00.000Z' : '2026-07-19T12:01:00.000Z',
            policy: { version: 1 },
            repositoryId: context.repositoryId,
            reviewId: context.reviewId,
            ...(context.previousReviewId === undefined
              ? {}
              : { previousReviewId: context.previousReviewId }),
          }),
        };
      },
      reviewWorktree: () =>
        Promise.reject(new Error('The judge demo exercises the Ghost Change only.')),
      startedAt: '2026-07-19T12:00:00.000Z',
      tools: {
        git: { available: true, version: 'fixture' },
        gh: { available: true, version: 'fixture' },
      },
      version: '0.1.0',
    });
    service = activeService;
    const connection: JudgeDemoConnection = {
      baseUrl: activeService.baseUrl,
      bearerToken: activeService.bearerToken,
    };
    const registeredRepository = repositoryRecordSchema.parse(
      await requestJson(connection, '/v1/repositories', { method: 'POST', body: '{}' }),
    );
    await requestJson(connection, `/v1/repositories/${registeredRepository.repositoryId}/index`, {
      method: 'POST',
      body: '{}',
    });
    const started = reviewOperationSchema.parse(
      await requestJson(connection, '/v1/reviews/pull-request/start', {
        method: 'POST',
        body: JSON.stringify({ schemaVersion: 1, pullRequestNumber: fixture.pullRequestNumber }),
      }),
    );
    const initialReview = await waitForCompletedReview(connection, started.reviewId);
    if (initialReview.status !== 'completed' || initialReview.review.verdict !== 'ESCALATE') {
      throw new Error('Judge demo did not produce the expected Ghost Change escalation.');
    }
    phase = 'corrected';
    let closed = false;

    return {
      root,
      baseUrl: activeService.baseUrl,
      bearerToken: activeService.bearerToken,
      githubTransport: 'fixture',
      initialReviewId: initialReview.reviewId,
      modelCalls: 0,
      close: async () => {
        if (closed) {
          return;
        }
        closed = true;
        try {
          await activeService.close();
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    await service?.close();
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

async function requestJson(
  demo: JudgeDemoConnection,
  path: string,
  options: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(`${demo.baseUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${demo.bearerToken}`,
      'content-type': 'application/json',
      ...options.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Judge demo request failed with ${response.status}.`);
  }
  return response.json();
}

async function waitForCompletedReview(
  demo: JudgeDemoConnection,
  reviewId: string,
): Promise<ReviewOperationContract> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const operation = reviewOperationSchema.parse(
      await requestJson(demo, `/v1/reviews/${encodeURIComponent(reviewId)}`, { method: 'GET' }),
    );
    if (operation.status === 'completed') {
      return operation;
    }
    if (operation.status === 'failed') {
      throw new Error('Judge demo review did not complete.');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Judge demo review did not complete within the local polling bound.');
}

export async function runJudgeDemoSmoke(
  options: JudgeDemoOptions = {},
): Promise<JudgeDemoSmokeResult> {
  const demo = await startJudgeDemo(options);

  try {
    const initial = await waitForCompletedReview(demo, demo.initialReviewId);
    if (initial.status !== 'completed' || initial.review.verdict !== 'ESCALATE') {
      throw new Error('Judge demo did not retain the expected Ghost Change escalation.');
    }
    const historicalPullRequests = pullRequestExplorerResponseSchema.parse(
      await requestJson(demo, '/v1/pull-requests/explore', {
        method: 'POST',
        body: JSON.stringify({
          schemaVersion: 1,
          repositoryId: initial.repositoryId,
          state: 'all',
          reviewState: 'all',
          sort: 'newest',
        }),
      }),
    );
    const historicalPullRequestNumbers = historicalPullRequests.pullRequests.map(
      ({ number }) => number,
    );
    if (
      !historicalPullRequestNumbers.includes(8) ||
      !historicalPullRequestNumbers.includes(10) ||
      !historicalPullRequestNumbers.includes(12)
    ) {
      throw new Error('Judge demo did not expose the historical Ghost Change pull requests.');
    }
    const started = reviewOperationSchema.parse(
      await requestJson(demo, '/v1/reviews/pull-request/start', {
        method: 'POST',
        body: JSON.stringify({ schemaVersion: 1, pullRequestNumber: 12 }),
      }),
    );
    const corrected = await waitForCompletedReview(demo, started.reviewId);
    if (corrected.status !== 'completed' || corrected.review.verdict !== 'FAST_PATH') {
      throw new Error('Judge demo did not produce the corrected Ghost Change fast path.');
    }
    if (corrected.previousReview?.reviewId !== demo.initialReviewId) {
      throw new Error('Judge demo did not preserve the initial review for its re-review.');
    }

    return {
      githubTransport: demo.githubTransport,
      modelCalls: demo.modelCalls,
      historicalPullRequestNumbers,
      initialReviewId: demo.initialReviewId,
      initialVerdict: initial.review.verdict,
      correctedVerdict: corrected.review.verdict,
      correctedPreviousReviewId: corrected.previousReview.reviewId,
      evidenceIds: initial.evidenceTimeline.map(({ evidence }) => evidence.sourceId),
      correctedFindingIds: corrected.review.findings.map(({ id }) => id),
    };
  } finally {
    await demo.close();
  }
}

interface JudgeDemoConnection {
  baseUrl: string;
  bearerToken: string;
}

async function waitForShutdownSignal(): Promise<void> {
  await new Promise<void>((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const demo = await startJudgeDemo();
  process.stdout.write(
    `Gatekeeper judge demo is ready at ${demo.baseUrl}/pull-requests. Browse the historical PR evidence, open PR #12, then run its re-review to show the corrected FAST_PATH result. Press Ctrl+C to stop.\n`,
  );
  try {
    await waitForShutdownSignal();
  } finally {
    await demo.close();
  }
}
