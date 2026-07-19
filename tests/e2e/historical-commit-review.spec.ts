import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { repositoryRecordSchema, type RepositorySnapshot } from '@gatekeeper/contracts';
import { expect, test } from '@playwright/test';

import { runCommitReview } from '../../apps/cli/src/commit-review.js';
import {
  startGatekeeperService,
  type RunningGatekeeperService,
  type StartGatekeeperServiceOptions,
} from '../../apps/server/src/service.js';

const execFileAsync = promisify(execFile);

async function git(root: string, arguments_: readonly string[], date?: string): Promise<string> {
  const result = await execFileAsync('git', [...arguments_], {
    cwd: root,
    encoding: 'utf8',
    env: date === undefined ? process.env : { ...process.env, GIT_AUTHOR_DATE: date },
    maxBuffer: 1_024 * 1_024,
    timeout: 30_000,
    windowsHide: true,
  });
  return result.stdout.trim();
}

async function commit(root: string, title: string, date: string): Promise<string> {
  await git(root, ['add', '--all']);
  await git(root, ['commit', '--message', title, '--date', date], date);
  return git(root, ['rev-parse', 'HEAD']);
}

test.describe('Historical commit review dashboard', () => {
  let root: string;
  let repositoryRoot: string;
  let sourceOnlySha: string;
  let service: RunningGatekeeperService;
  let serviceOptions: StartGatekeeperServiceOptions;

  test.beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'gatekeeper-commit-browser-'));
    repositoryRoot = join(root, 'repository');
    const appData = join(root, 'app-data');
    const dashboardRoot = join(process.cwd(), 'apps', 'dashboard', 'dist');
    await access(join(dashboardRoot, 'index.html'));
    await mkdir(join(repositoryRoot, '.gatekeeper'), { recursive: true });
    await mkdir(join(repositoryRoot, 'src'), { recursive: true });
    await mkdir(join(repositoryRoot, 'tests'), { recursive: true });
    await writeFile(
      join(repositoryRoot, '.gatekeeper', 'policies.yaml'),
      'version: 1\ntests:\n  relationships:\n    - id: source-needs-tests\n      source:\n        - src/**\n      tests:\n        - tests/**\n      enforcement: required\n',
      'utf8',
    );
    await writeFile(join(repositoryRoot, 'src', 'app.ts'), 'export const app = 1;\n', 'utf8');
    await writeFile(join(repositoryRoot, 'tests', 'app.test.ts'), 'export {};\n', 'utf8');
    await git(repositoryRoot, ['init', '--initial-branch=master']);
    await git(repositoryRoot, ['config', 'user.email', 'gatekeeper@example.invalid']);
    await git(repositoryRoot, ['config', 'user.name', 'Gatekeeper Browser Test']);
    await commit(repositoryRoot, 'Initial policy', '2026-01-01T00:00:00Z');

    for (let index = 1; index <= 10; index += 1) {
      await writeFile(join(repositoryRoot, `history-${index}.md`), `history ${index}\n`, 'utf8');
      await commit(
        repositoryRoot,
        `History ${index}`,
        `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
      );
    }
    await writeFile(join(repositoryRoot, 'src', 'app.ts'), 'export const app = 2;\n', 'utf8');
    sourceOnlySha = await commit(
      repositoryRoot,
      'Source change without test',
      '2026-02-01T00:00:00Z',
    );

    const repository: RepositorySnapshot = {
      root: repositoryRoot,
      branch: 'master',
      head: await git(repositoryRoot, ['rev-parse', 'HEAD']),
      dirty: false,
      remote: null,
    };
    serviceOptions = {
      bearerToken: 'c'.repeat(43),
      dashboardRoot,
      logger: false,
      paths: {
        appData,
        serviceMetadata: join(appData, 'service.json'),
        storage: join(appData, 'storage'),
      },
      repository,
      reviewCommit: (sha, context) => runCommitReview(repositoryRoot, sha, undefined, context),
      reviewPullRequest: () => Promise.reject(new Error('Not exercised by commit history test.')),
      reviewWorktree: () => Promise.reject(new Error('Not exercised by commit history test.')),
      startedAt: '2026-02-02T00:00:00.000Z',
      tools: {
        git: { available: true, version: 'fixture' },
        gh: { available: false, version: null },
      },
      version: '0.1.0',
    };
    service = await startGatekeeperService(serviceOptions);
  });

  test.afterAll(async () => {
    await service.close().catch(() => undefined);
    await rm(root, { force: true, recursive: true });
  });

  test('shows ten commits, searches, reviews, restarts, and preserves repository state', async ({
    page,
  }) => {
    const headers = { authorization: `Bearer ${service.bearerToken}` };
    const repositoryResponse = await page.request.post(`${service.baseUrl}/v1/repositories`, {
      data: {},
      headers,
    });
    const repository = repositoryRecordSchema.parse(await repositoryResponse.json());
    const indexResponse = await page.request.post(
      `${service.baseUrl}/v1/repositories/${repository.repositoryId}/index`,
      { data: {}, headers },
    );
    expect(indexResponse.ok()).toBe(true);
    const before = {
      head: await git(repositoryRoot, ['rev-parse', 'HEAD']),
      index: await git(repositoryRoot, ['write-tree']),
      status: await git(repositoryRoot, ['status', '--porcelain=v1']),
      source: await readFile(join(repositoryRoot, 'src', 'app.ts'), 'utf8'),
    };

    await page.goto(`${service.baseUrl}/memory`);
    const history = page.getByRole('table', {
      name: 'Historical commits use a first-parent review.',
    });
    await expect(history.getByRole('row')).toHaveCount(11);
    await expect(page.getByText('Source change without test', { exact: true })).toBeVisible();

    await page.getByLabel('Evidence query').fill('history');
    await page.getByRole('button', { name: 'Search memory' }).click();
    await expect(history).toBeHidden();
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(history.getByRole('row')).toHaveCount(11);

    const sourceRow = history.getByRole('row').filter({ hasText: 'Source change without test' });
    await sourceRow.getByRole('button', { name: 'Review commit' }).click();
    await expect(page).toHaveURL(/\/reviews\/review_[a-f0-9]+$/u);
    await expect(page.getByRole('heading', { name: 'REQUIRE_CHANGES' })).toBeVisible();
    await expect(page.getByText('Related test change required', { exact: true })).toBeVisible();
    await expect(
      page.getByLabel('Findings').getByText('src/app.ts', { exact: true }),
    ).toBeVisible();
    const persistedPath = new URL(page.url()).pathname;

    await service.close();
    service = await startGatekeeperService({
      ...serviceOptions,
      startedAt: '2026-02-03T00:00:00.000Z',
    });
    await page.goto(`${service.baseUrl}${persistedPath}`);
    await expect(page.getByRole('heading', { name: 'REQUIRE_CHANGES' })).toBeVisible();
    await page.getByRole('button', { name: 'Run re-review' }).click();
    await expect(page.getByRole('heading', { name: 'REQUIRE_CHANGES' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Before / after' })).toBeVisible();

    expect(await git(repositoryRoot, ['rev-parse', 'HEAD'])).toBe(before.head);
    expect(await git(repositoryRoot, ['write-tree'])).toBe(before.index);
    expect(await git(repositoryRoot, ['status', '--porcelain=v1'])).toBe(before.status);
    await expect(readFile(join(repositoryRoot, 'src', 'app.ts'), 'utf8')).resolves.toBe(
      before.source,
    );
    expect(sourceOnlySha).toHaveLength(40);
  });
});
