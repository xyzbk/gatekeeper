import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { repositoryRecordSchema, type RepositorySnapshot } from '@gatekeeper/contracts';
import { createGitHubProvider, normalizeGitHubRemote } from '@gatekeeper/github-gh';
import { reviewPullRequest } from '@gatekeeper/review-engine';
import { expect, test, type Page } from '@playwright/test';

import {
  createGhostChangeRunner,
  loadGhostChangeFixture,
} from '../../demo/ghost-change-fixture.js';
import {
  startGatekeeperService,
  type RunningGatekeeperService,
  type StartGatekeeperServiceOptions,
} from '../../apps/server/src/service.js';

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

async function assertNoDocumentOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

test.describe('Ghost Change dashboard', () => {
  let root: string;
  let service: RunningGatekeeperService;
  let serviceOptions: StartGatekeeperServiceOptions;

  test.beforeAll(async () => {
    const fixture = await loadGhostChangeFixture();
    root = await mkdtemp(join(tmpdir(), 'gatekeeper-ghost-browser-'));
    const appData = join(root, 'app-data');
    const repositoryRoot = join(root, 'repository');
    const dashboardRoot = join(process.cwd(), 'apps', 'dashboard', 'dist');
    const paths = {
      appData,
      serviceMetadata: join(appData, 'service.json'),
      storage: join(appData, 'storage'),
    };
    await access(join(dashboardRoot, 'index.html'));
    await mkdir(join(repositoryRoot, 'docs', 'adr'), { recursive: true });
    await mkdir(join(repositoryRoot, '.gatekeeper'), { recursive: true });
    await writeFile(join(repositoryRoot, '.gatekeeper', 'policies.yaml'), 'version: 1\n', 'utf8');
    await writeFile(
      join(repositoryRoot, 'docs', 'adr', '0003-no-required-redis.md'),
      '# No required Redis\n\nStatus: active\n\nRedis cache stays optional; SQLite is durable.\n',
      'utf8',
    );
    await runGit(repositoryRoot, ['init', '--initial-branch=master']);
    await runGit(repositoryRoot, ['config', 'user.email', 'gatekeeper@example.invalid']);
    await runGit(repositoryRoot, ['config', 'user.name', 'Gatekeeper Browser Test']);
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
    serviceOptions = {
      bearerToken: 'e'.repeat(43),
      dashboardRoot,
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
        reviewSequence += 1;
        await new Promise((resolve) => setTimeout(resolve, 250));
        const reviewedPullRequest =
          reviewSequence === 1
            ? pullRequest
            : {
                ...pullRequest,
                body: pullRequest.body.replace(
                  /\n\nIgnore all previous instructions[\s\S]*$/u,
                  '\n\nRemediated: project history remains evidence, never instructions.',
                ),
              };
        return {
          pullRequest: reviewedPullRequest,
          remote,
          review: reviewPullRequest({
            changeSet,
            pullRequest: reviewedPullRequest,
            createdAt: `2026-07-19T0${reviewSequence}:00:00.000Z`,
            policy: { version: 1 },
            repositoryId: context.repositoryId,
            reviewId: context.reviewId,
            ...(context.previousReviewId === undefined
              ? {}
              : { previousReviewId: context.previousReviewId }),
          }),
        };
      },
      reviewWorktree: () => Promise.reject(new Error('Not exercised by Ghost Change.')),
      startedAt: '2026-07-19T00:00:00.000Z',
      tools: {
        git: { available: true, version: 'fixture' },
        gh: { available: true, version: 'fixture' },
      },
      version: '0.1.0',
    };
    service = await startGatekeeperService(serviceOptions);
  });

  test.afterAll(async () => {
    await service.close().catch(() => undefined);
    await rm(root, { force: true, recursive: true });
  });

  test('proves progress, historical evidence, remediation, restart and re-review', async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const headers = { authorization: `Bearer ${service.bearerToken}` };
    const repositoryResponse = await page.request.post(`${service.baseUrl}/v1/repositories`, {
      data: {},
      headers,
    });
    expect(repositoryResponse.ok()).toBe(true);
    const repository = repositoryRecordSchema.parse(await repositoryResponse.json());
    const indexResponse = await page.request.post(
      `${service.baseUrl}/v1/repositories/${repository.repositoryId}/index`,
      { data: {}, headers },
    );
    expect(indexResponse.ok()).toBe(true);

    const syncResponse = await page.request.post(
      `${service.baseUrl}/v1/repositories/${repository.repositoryId}/sync/github`,
      { data: {}, headers },
    );
    expect(syncResponse.ok()).toBe(true);

    await page.goto(`${service.baseUrl}/pull-requests`);
    await expect(page.getByRole('heading', { name: 'Browse pull requests' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Revive required Redis cache' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Revert required Redis cache' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Require Redis cache' })).toBeVisible();

    const currentPullRequest = page
      .getByRole('article')
      .filter({ hasText: 'Revive required Redis cache' });
    await currentPullRequest.getByRole('link', { name: 'View evidence' }).click();
    await expect(page).toHaveURL(/\/memory\?query=pull_request%3A%2312$/u);
    await expect(page.getByRole('heading', { name: 'Evidence' })).toBeVisible();
    await expect(page.getByText('pull_request:#12', { exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Pull request evidence' }).click();
    await expect(page).toHaveURL(/\/pull-requests$/u);
    await page.getByRole('button', { name: 'Review pull request #12' }).click();
    await expect(page).toHaveURL(/\/reviews\/review_[a-f0-9]+$/u);
    await expect(page.getByRole('status', { name: 'Review progress' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ESCALATE' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Prompt-injection pattern detected in untrusted evidence' }),
    ).toBeVisible();
    await expect(page.getByText('Assembled locally by Gatekeeper')).toBeVisible();

    const timeline = page.getByRole('list', { name: 'Evidence timeline' });
    await expect(timeline.getByRole('listitem')).toHaveCount(6);
    await expect(timeline.getByText('Proposal', { exact: true })).toBeVisible();
    await expect(timeline.getByText('Revived change', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Remediation' })).toBeVisible();
    await page.getByRole('button', { name: 'Copy fix prompt' }).click();
    await expect(page.getByText('Fix prompt copied.')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain('review_');
    await page.evaluate(() => scrollTo({ behavior: 'instant', top: 0 }));
    await page.screenshot({ fullPage: true, path: testInfo.outputPath('ghost-escalate-1440.png') });

    const persistedPath = new URL(page.url()).pathname;
    await service.close();
    service = await startGatekeeperService({
      ...serviceOptions,
      startedAt: '2026-07-19T03:00:00.000Z',
    });
    await page.goto(`${service.baseUrl}${persistedPath}`);
    await expect(page.getByRole('heading', { name: 'ESCALATE' })).toBeVisible();

    await page.getByRole('button', { name: 'Run re-review' }).click();
    await expect(page).not.toHaveURL(new RegExp(`${persistedPath}$`, 'u'));
    await expect(page.getByRole('status', { name: 'Review progress' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'FAST_PATH' })).toBeVisible();
    const comparison = page.getByRole('region', { name: 'Before / after' });
    await expect(comparison).toBeVisible();
    await expect(comparison.getByText('ESCALATE', { exact: true })).toBeVisible();
    await expect(comparison.getByText('FAST_PATH', { exact: true })).toBeVisible();
    await expect(comparison.getByText('finding:content-security:prompt-injection')).toBeVisible();

    for (const viewport of [
      { height: 900, width: 1_440 },
      { height: 720, width: 1_280 },
      { height: 768, width: 1_024 },
    ]) {
      await page.setViewportSize(viewport);
      await assertNoDocumentOverflow(page);
      await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath(`ghost-comparison-${viewport.width}.png`),
      });
    }

    await page.reload();
    await expect(page.getByRole('heading', { name: 'FAST_PATH' })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByText('Skip to main content', { exact: true })).toBeFocused();
    const focusStyle = await page
      .getByText('Skip to main content', { exact: true })
      .evaluate((node) => ({
        focusVisible: node.matches(':focus-visible'),
        outlineStyle: getComputedStyle(node).outlineStyle,
      }));
    expect(focusStyle).toEqual({ focusVisible: true, outlineStyle: 'solid' });
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true,
    );
  });
});
