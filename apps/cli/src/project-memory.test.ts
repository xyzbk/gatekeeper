import type {
  ChangeSet,
  GitHubHistoryBatch,
  GitHubRemote,
  GitHubSyncResult,
  IndexResult,
  MemorySearchResult,
  PullRequestRecord,
  RepositoryRecord,
  RepositorySnapshot,
  ReviewRunContract,
} from '@gatekeeper/contracts';
import { GitHubProviderError, type GitHubProvider } from '@gatekeeper/github-gh';
import type { ProjectMemory } from '@gatekeeper/project-memory';
import { ProjectMemoryError } from '@gatekeeper/project-memory';
import { SqliteProjectStoreError } from '@gatekeeper/store-sqlite';
import { describe, expect, it, vi } from 'vitest';

import {
  classifyProjectMemoryCommandError,
  createProjectMemoryCommands,
  formatMemorySearch,
  ProjectMemoryCommandError,
} from './project-memory.js';

const snapshot: RepositorySnapshot = {
  root: '/target/repository',
  branch: 'master',
  head: 'a'.repeat(40),
  dirty: true,
  remote: 'git@github.com:example/repository.git',
};

const repository: RepositoryRecord = {
  schemaVersion: 1,
  repositoryId: 'repository_test',
  root: snapshot.root,
  remote: snapshot.remote,
  createdAt: '2026-07-18T12:00:00.000Z',
  updatedAt: '2026-07-18T12:00:00.000Z',
};

const indexResult: IndexResult = {
  schemaVersion: 1,
  repositoryId: repository.repositoryId,
  head: snapshot.head,
  indexedAt: '2026-07-18T12:01:00.000Z',
  files: { scanned: 3, written: 3, unchanged: 0, deleted: 0 },
  documents: { scanned: 2, written: 2, unchanged: 0, deleted: 0 },
  commits: { scanned: 1, written: 1, unchanged: 0, deleted: 0 },
};

const searchResult: MemorySearchResult = {
  documentId: 'document_test',
  match: 'exact',
  trust: 'untrusted_repository_content',
  status: 'active',
  occurredAt: null,
  evidence: {
    sourceType: 'adr',
    repositoryId: repository.repositoryId,
    sourceId: 'docs/adr/0003-no-redis.md',
    path: 'docs/adr/0003-no-redis.md',
    excerpt: 'Do not require Redis for the local cache.',
  },
};

const review: ReviewRunContract = {
  schemaVersion: 1,
  reviewId: 'review_next',
  previousReviewId: 'review_previous',
  repositoryId: repository.repositoryId,
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
  createdAt: '2026-07-18T12:02:00.000Z',
};

const githubRemote: GitHubRemote = {
  host: 'github.com',
  owner: 'example',
  name: 'repository',
  nameWithOwner: 'example/repository',
  url: 'https://github.com/example/repository',
};

const pullRequest: PullRequestRecord = {
  number: 12,
  title: 'Require Redis cache',
  body: 'Bounded PR body.',
  state: 'OPEN',
  url: 'https://github.com/example/repository/pull/12',
  author: 'octocat',
  baseRefName: 'master',
  headRefName: 'redis-cache',
  headRefOid: 'b'.repeat(40),
  additions: 1,
  deletions: 0,
  changedFiles: 1,
  checks: 'pass',
  isDraft: false,
  closingIssueNumbers: [4],
  createdAt: '2026-07-18T12:00:00.000Z',
  updatedAt: '2026-07-18T12:01:00.000Z',
  closedAt: null,
  mergedAt: null,
};

const pullRequestReview: ReviewRunContract = {
  ...review,
  reviewId: 'review_pr_12',
  target: {
    kind: 'pull_request',
    display: 'Pull request #12',
    pullRequestNumber: 12,
    base: 'master',
    head: 'redis-cache',
  },
};

const commitReview: ReviewRunContract = {
  ...review,
  reviewId: 'review_commit',
  target: {
    kind: 'commit_range',
    display: 'Commit cccccccccccc',
    base: 'b'.repeat(40),
    head: 'c'.repeat(40),
  },
};

const historyBatch: GitHubHistoryBatch = {
  schemaVersion: 1,
  cursor: '2026-07-18T12:01:00.000Z',
  partial: false,
  failures: [],
  records: [],
};

const syncResult: GitHubSyncResult = {
  schemaVersion: 1,
  repositoryId: repository.repositoryId,
  provider: 'github',
  syncedAt: '2026-07-18T12:02:00.000Z',
  cursor: historyBatch.cursor,
  partial: false,
  documents: { received: 0, written: 0, unchanged: 0 },
  links: { received: 0, written: 0, unchanged: 0 },
  failures: [],
};

function fakeGitHubProvider(overrides: Partial<GitHubProvider> = {}): GitHubProvider {
  return {
    preflight: () => Promise.resolve({ schemaVersion: 1, host: 'github.com', authenticated: true }),
    getPullRequest: () => Promise.resolve(pullRequest),
    getPullRequestDiff: () =>
      Promise.resolve({
        schemaVersion: 1,
        target: { kind: 'pull_request', display: 'Pull request #12', pullRequestNumber: 12 },
        files: [],
      } satisfies ChangeSet),
    listHistoricalDocuments: () => Promise.resolve(historyBatch),
    ...overrides,
  };
}

function fakeMemory(overrides: Partial<ProjectMemory> = {}): ProjectMemory {
  return {
    migrate: () => Promise.resolve(),
    registerRepository: () => Promise.resolve(repository),
    findRepository: () => Promise.resolve(repository),
    getRepository: () => Promise.resolve(repository),
    getIndexState: () => Promise.resolve(null),
    getRemoteSyncCursor: () => Promise.resolve(null),
    indexLocalRepository: () => Promise.resolve(indexResult),
    indexRemoteDocuments: () => Promise.resolve(syncResult),
    search: () => Promise.resolve([searchResult]),
    saveReview: () => Promise.resolve(),
    getReview: () => Promise.resolve(review),
    latestReviewId: () => Promise.resolve('review_previous'),
    ...overrides,
  };
}

describe('Project Memory CLI composition', () => {
  it('initializes, reports status, indexes policy ignores, and closes every session', async () => {
    const close = vi.fn();
    const indexLocalRepository = vi.fn(() => Promise.resolve(indexResult));
    const memory = fakeMemory({
      registerRepository: vi.fn(() => Promise.resolve(repository)),
      findRepository: vi.fn(() => Promise.resolve(repository)),
      getIndexState: vi.fn(() => Promise.resolve(null)),
      indexLocalRepository,
    });
    const commands = createProjectMemoryCommands({
      inspectRepository: () => Promise.resolve(snapshot),
      loadPolicy: () =>
        Promise.resolve({
          path: '/target/repository/.gatekeeper/policies.yaml',
          source: 'file',
          policy: { version: 1, paths: { ignore: ['generated/**'] } },
        }),
      openSession: () => Promise.resolve({ memory, close }),
      reviewWorktree: () => Promise.resolve(review),
    });

    await expect(commands.initialize('.')).resolves.toEqual(repository);
    await expect(commands.status('.')).resolves.toEqual({
      schemaVersion: 1,
      state: 'ready',
      repository,
      indexState: null,
    });
    await expect(commands.index('.')).resolves.toEqual(indexResult);

    expect(indexLocalRepository).toHaveBeenCalledWith({
      repositoryId: repository.repositoryId,
      ignorePatterns: ['generated/**'],
    });
    expect(close).toHaveBeenCalledTimes(3);
  });

  it('searches one initialized repository and persists a chained worktree review', async () => {
    const close = vi.fn();
    const saveReview = vi.fn(() => Promise.resolve());
    const reviewWorktree = vi.fn(() => Promise.resolve(review));
    const commands = createProjectMemoryCommands({
      inspectRepository: () => Promise.resolve(snapshot),
      loadPolicy: () => Promise.resolve({ path: null, source: 'default', policy: { version: 1 } }),
      openSession: () => Promise.resolve({ memory: fakeMemory({ saveReview }), close }),
      reviewWorktree,
    });

    await expect(commands.search('.', 'redis cache', 7)).resolves.toEqual([searchResult]);
    await expect(commands.reviewWorktree('.')).resolves.toEqual(review);
    await expect(commands.showReview(review.reviewId)).resolves.toEqual(review);

    expect(reviewWorktree).toHaveBeenCalledWith(snapshot.root, {
      repositoryId: repository.repositoryId,
      previousReviewId: 'review_previous',
    });
    expect(saveReview).toHaveBeenCalledWith(review);
    expect(close).toHaveBeenCalledTimes(3);
  });

  it('persists a commit review with history scoped to the selected SHA', async () => {
    const close = vi.fn();
    const latestReviewId = vi.fn(() => Promise.resolve('review_commit_previous'));
    const saveReview = vi.fn(() => Promise.resolve());
    const reviewCommit = vi.fn(() => Promise.resolve(commitReview));
    const commands = createProjectMemoryCommands({
      inspectRepository: () => Promise.resolve(snapshot),
      loadPolicy: () => Promise.resolve({ path: null, source: 'default', policy: { version: 1 } }),
      openSession: () =>
        Promise.resolve({ memory: fakeMemory({ latestReviewId, saveReview }), close }),
      reviewCommit,
      reviewWorktree: () => Promise.resolve(review),
    });

    await expect(commands.reviewCommit('c'.repeat(40), '.')).resolves.toEqual(commitReview);

    expect(latestReviewId).toHaveBeenCalledWith(repository.repositoryId, {
      kind: 'commit_range',
      display: 'Commit cccccccccccc',
      head: 'c'.repeat(40),
    });
    expect(reviewCommit).toHaveBeenCalledWith(snapshot.root, 'c'.repeat(40), {
      repositoryId: repository.repositoryId,
      previousReviewId: 'review_commit_previous',
    });
    expect(saveReview).toHaveBeenCalledWith(commitReview);
  });

  it('syncs bounded GitHub history and persists one pull-request review read-only', async () => {
    const close = vi.fn();
    const indexRemoteDocuments = vi.fn(() => Promise.resolve(syncResult));
    const saveReview = vi.fn(() => Promise.resolve());
    const getRemoteSyncCursor = vi.fn(() => Promise.resolve(null));
    const listHistoricalDocuments = vi.fn(() => Promise.resolve(historyBatch));
    const reviewPullRequest = vi.fn(() =>
      Promise.resolve({
        review: pullRequestReview,
        pullRequest,
        remote: githubRemote,
      }),
    );
    const githubProvider = fakeGitHubProvider({ listHistoricalDocuments });
    const memory = fakeMemory({
      getRemoteSyncCursor,
      indexRemoteDocuments,
      latestReviewId: () => Promise.resolve(null),
      saveReview,
    });
    const commands = createProjectMemoryCommands({
      inspectRepository: () => Promise.resolve(snapshot),
      loadPolicy: () => Promise.resolve({ path: null, source: 'default', policy: { version: 1 } }),
      openSession: () => Promise.resolve({ memory, close }),
      reviewWorktree: () => Promise.resolve(review),
      githubProvider,
      reviewPullRequest,
    });

    await expect(commands.syncGitHub('.')).resolves.toEqual(syncResult);
    await expect(commands.reviewPullRequest(12, '.')).resolves.toEqual(pullRequestReview);

    expect(getRemoteSyncCursor).toHaveBeenCalledWith(repository.repositoryId, 'github');
    expect(listHistoricalDocuments).toHaveBeenCalledWith(githubRemote, expect.any(Object), null);
    expect(indexRemoteDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ repositoryId: repository.repositoryId, provider: 'github' }),
    );
    expect(reviewPullRequest).toHaveBeenCalledWith(snapshot.root, 12, {
      repositoryId: repository.repositoryId,
    });
    expect(saveReview).toHaveBeenCalledWith(pullRequestReview);
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('returns stable errors, closes failed sessions, and formats trust labels', async () => {
    const close = vi.fn();
    const commands = createProjectMemoryCommands({
      inspectRepository: () => Promise.resolve(snapshot),
      loadPolicy: () => Promise.resolve({ path: null, source: 'default', policy: { version: 1 } }),
      openSession: () =>
        Promise.resolve({
          memory: fakeMemory({
            findRepository: () => Promise.resolve(null),
            getReview: () => Promise.resolve(null),
          }),
          close,
        }),
      reviewWorktree: () => Promise.resolve(review),
    });

    await expect(commands.index('.')).rejects.toMatchObject({ code: 'NOT_INITIALIZED' });
    await expect(commands.showReview('review_missing')).rejects.toMatchObject({
      code: 'REVIEW_NOT_FOUND',
    });
    expect(close).toHaveBeenCalledTimes(2);
    expect(formatMemorySearch([searchResult], 'human')).toContain(
      '[untrusted_repository_content/exact] adr docs/adr/0003-no-redis.md',
    );
    expect(JSON.parse(formatMemorySearch([searchResult], 'json'))).toEqual({
      schemaVersion: 1,
      results: [searchResult],
    });

    const classified = classifyProjectMemoryCommandError(new Error('private source and token'));
    expect(classified).toEqual({
      exitCode: 6,
      message: 'Gatekeeper could not complete the Project Memory command.',
    });
    expect(classified.message).not.toContain('private');
    expect(
      classifyProjectMemoryCommandError(
        new ProjectMemoryCommandError('NOT_INITIALIZED', 'Initialize this repository first.'),
      ),
    ).toEqual({ exitCode: 2, message: 'Initialize this repository first.' });
    expect(
      classifyProjectMemoryCommandError(
        new ProjectMemoryError('INDEX_SOURCE_FAILED', 'The bounded Git index failed.'),
      ),
    ).toEqual({ exitCode: 4, message: 'The bounded Git index failed.' });
    expect(
      classifyProjectMemoryCommandError(
        new SqliteProjectStoreError('MIGRATION_FAILED', 'The local migration failed.'),
      ),
    ).toEqual({ exitCode: 3, message: 'The local migration failed.' });
    expect(
      classifyProjectMemoryCommandError(
        new SqliteProjectStoreError('INDEX_WRITE_FAILED', 'The index transaction failed.'),
      ),
    ).toEqual({ exitCode: 4, message: 'The index transaction failed.' });
    expect(
      classifyProjectMemoryCommandError(
        new GitHubProviderError(
          'AUTH_REQUIRED',
          'GitHub CLI authentication is required.',
          'Run `gh auth login`.',
        ),
      ),
    ).toEqual({
      exitCode: 3,
      message: 'GitHub CLI authentication is required. Run `gh auth login`.',
    });
    expect(
      classifyProjectMemoryCommandError(
        Object.assign(new Error('private invalid query detail'), { name: 'ZodError' }),
      ),
    ).toEqual({ exitCode: 2, message: 'The Project Memory command input is invalid.' });
  });
});
