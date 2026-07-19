import type {
  RepositorySnapshot,
  ReviewRunContract,
  ToolAvailability,
} from '@gatekeeper/contracts';
import { SqliteProjectStoreError } from '@gatekeeper/store-sqlite';
import { describe, expect, it, vi } from 'vitest';

const repository: RepositorySnapshot = {
  root: 'D:\\work\\gatekeeper',
  branch: 'master',
  head: 'a'.repeat(40),
  dirty: false,
  remote: 'https://github.com/xyzbk/gatekeeper.git',
};

const git: ToolAvailability = { available: true, version: 'git version 2.50.1' };
const gh: ToolAvailability = { available: false, version: null };
const review = {
  schemaVersion: 1,
  reviewId: 'review_start_test',
  repositoryId: 'repository_start_test',
  target: { kind: 'worktree', display: 'Current worktree' },
  verdict: 'FAST_PATH',
  summary: 'FAST_PATH: 0 changed files, 0 deterministic findings.',
  findings: [],
  metrics: {
    filesChanged: 0,
    linesAdded: 0,
    linesDeleted: 0,
    productionFilesChanged: 0,
    testFilesChanged: 0,
    documentationFilesChanged: 0,
    pathGroups: [],
  },
  changes: [],
  createdAt: '2026-07-18T12:00:00.000Z',
} satisfies ReviewRunContract;

const commitReview = {
  ...review,
  target: {
    kind: 'commit_range' as const,
    display: 'Commit cccccccccccc',
    base: 'b'.repeat(40),
    head: 'c'.repeat(40),
  },
} satisfies ReviewRunContract;

describe('start command lifecycle', () => {
  it('starts one fixed repository and closes the foreground service on shutdown', async () => {
    const events: string[] = [];
    const output: string[] = [];
    const close = vi.fn(() => {
      events.push('close');
      return Promise.resolve();
    });
    const { runStartCommand } = await import('./start.js');

    await runStartCommand(
      'D:\\work\\gatekeeper',
      {
        dashboardRoot: 'D:\\work\\gatekeeper\\apps\\dashboard\\dist',
        inspectRepository: (path) => {
          events.push(`inspect:${path}`);
          return Promise.resolve(repository);
        },
        inspectTool: (name) => {
          events.push(`tool:${name}`);
          return Promise.resolve(name === 'git' ? git : gh);
        },
        reviewWorktree: (root, context) => {
          events.push(`review:${root}`);
          return Promise.resolve({ ...review, repositoryId: context.repositoryId });
        },
        reviewPullRequest: () => Promise.reject(new Error('not exercised')),
        reviewCommit: (root, sha, context) => {
          events.push(`commit:${root}:${sha}`);
          return Promise.resolve({ ...commitReview, repositoryId: context.repositoryId });
        },
        startService: async (options) => {
          events.push('start');
          expect(options).toMatchObject({
            dashboardRoot: 'D:\\work\\gatekeeper\\apps\\dashboard\\dist',
            deterministicOnly: true,
            repository,
            tools: { git, gh },
            version: '0.1.0',
          });
          await expect(
            options.reviewWorktree({ repositoryId: 'repository_start_test' as never }),
          ).resolves.toEqual(review);
          await expect(
            options.reviewCommit('c'.repeat(40), {
              repositoryId: 'repository_start_test' as never,
            }),
          ).resolves.toEqual(commitReview);
          return { baseUrl: 'http://127.0.0.1:43127', close };
        },
        waitUntilShutdown: () => {
          events.push('wait');
          return Promise.resolve();
        },
        write: (message) => {
          output.push(message);
        },
      },
      { deterministicOnly: true },
    );

    expect(events).toEqual([
      'inspect:D:\\work\\gatekeeper',
      'tool:git',
      'tool:gh',
      'start',
      'review:D:\\work\\gatekeeper',
      `commit:D:\\work\\gatekeeper:${'c'.repeat(40)}`,
      'wait',
      'close',
    ]);
    expect(output.join('')).toBe(
      [
        'Gatekeeper is running.\n',
        'Repository: D:\\work\\gatekeeper\n',
        'Dashboard: http://127.0.0.1:43127\n',
        'Press Ctrl+C to stop.\n',
      ].join(''),
    );
    expect(output.join('')).not.toContain('Bearer');
  });

  it('still closes the service when foreground waiting fails', async () => {
    const close = vi.fn(() => Promise.resolve());
    const { runStartCommand } = await import('./start.js');

    await expect(
      runStartCommand('.', {
        dashboardRoot: 'dashboard',
        inspectRepository: () => Promise.resolve(repository),
        inspectTool: (name) => Promise.resolve(name === 'git' ? git : gh),
        reviewWorktree: () => Promise.resolve(review),
        reviewPullRequest: () => Promise.reject(new Error('not exercised')),
        reviewCommit: () => Promise.resolve(commitReview),
        startService: () => Promise.resolve({ baseUrl: 'http://127.0.0.1:43127', close }),
        waitUntilShutdown: () => Promise.reject(new Error('signal failure')),
        write: () => undefined,
      }),
    ).rejects.toThrow('signal failure');
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('local tool inspection', () => {
  it('uses an executable and argument array and returns the first version line', async () => {
    const runCommand = vi.fn(() =>
      Promise.resolve({ exitCode: 0, stdout: 'gh version 2.76.2\nhttps://example.invalid' }),
    );
    const { inspectLocalTool } = await import('./start.js');

    await expect(inspectLocalTool('gh', runCommand)).resolves.toEqual({
      available: true,
      version: 'gh version 2.76.2',
    });
    expect(runCommand).toHaveBeenCalledWith('gh', ['--version']);
  });

  it('treats a missing optional tool as unavailable without exposing errors', async () => {
    const { inspectLocalTool } = await import('./start.js');

    await expect(
      inspectLocalTool('gh', () => Promise.reject(new Error('private host detail'))),
    ).resolves.toEqual({ available: false, version: null });
  });

  it('keeps unexpected startup details out of CLI errors', async () => {
    const { formatStartError } = await import('./start.js');

    const message = formatStartError(new Error('private path and token detail'));

    expect(message).toBe(
      'Gatekeeper could not start the local service. Build the workspace and try again.',
    );
    expect(message).not.toContain('private path');
  });

  it('directs corrupt local state to the explicit repair command', async () => {
    const { formatStartError } = await import('./start.js');

    expect(
      formatStartError(new SqliteProjectStoreError('CORRUPT_DATA', 'private database detail')),
    ).toBe('Project Memory needs local repair. Run gatekeeper doctor --repair, then start again.');
  });
});
