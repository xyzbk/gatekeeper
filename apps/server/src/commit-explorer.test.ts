import type { CommitExplorerInput, GitCommitRecord } from '@gatekeeper/contracts';
import { describe, expect, it, vi } from 'vitest';

import { CommitExplorerBranchUnavailableError, exploreCommits } from './commit-explorer.js';

function input(overrides: Partial<CommitExplorerInput> = {}): CommitExplorerInput {
  return {
    schemaVersion: 1,
    source: 'all_local',
    reviewState: 'all',
    sort: 'newest',
    ...overrides,
  };
}

function commit(
  sha: string,
  title: string,
  authoredAt = '2026-07-19T12:00:00.000Z',
): GitCommitRecord {
  return {
    sha: sha.length === 1 ? sha.repeat(40) : sha,
    title,
    authoredAt,
    message: `${title} body.`,
  };
}

describe('Commit Explorer composition', () => {
  it('prefers master, joins bounded local state, and applies shared filters', async () => {
    const first = commit('a', 'Add local history page');
    const second = commit('b', 'Review protected commit', '2026-07-18T12:00:00.000Z');
    const listBranchCommits = vi.fn(() => Promise.resolve([first, second]));
    const commitStates = vi.fn(() =>
      Promise.resolve([
        { sha: first.sha, indexed: true, reviewed: false },
        { sha: second.sha, indexed: true, reviewed: true },
      ]),
    );

    const result = await exploreCommits(
      input({ source: 'project_memory', query: 'review', reviewState: 'reviewed' }),
      {
        currentBranch: 'feature/commit-explorer',
        git: {
          listBranchCommits,
          listLocalBranches: () =>
            Promise.resolve([
              { name: 'feature/commit-explorer', ref: 'refs/heads/feature/commit-explorer' },
              { name: 'master', ref: 'refs/heads/master' },
            ]),
        },
        memory: { commitStates },
        repositoryId: 'repository_commit_explorer',
        repositoryRoot: 'D:/work/repository',
      },
    );

    expect(result.selection.branch).toBe('master');
    expect(result.commits).toEqual([
      {
        sha: second.sha,
        title: second.title,
        authoredAt: second.authoredAt,
        indexed: true,
        reviewed: true,
      },
    ]);
    expect(listBranchCommits).toHaveBeenCalledWith('D:/work/repository', {
      ref: 'refs/heads/master',
      cursor: 0,
      limit: 48,
      sort: 'newest',
    });
    expect(commitStates).toHaveBeenCalledWith('repository_commit_explorer', [
      first.sha,
      second.sha,
    ]);
  });

  it('returns at most 24 cards and continues from a bounded cursor', async () => {
    const commits = Array.from({ length: 25 }, (_, index) =>
      commit(index.toString(16).padStart(40, 'a'), `Commit ${index + 1}`),
    );
    const listBranchCommits = vi.fn((_root: string, page: { cursor: number }) =>
      Promise.resolve(commits.slice(page.cursor, page.cursor + 48)),
    );

    const first = await exploreCommits(input(), {
      currentBranch: 'master',
      git: {
        listBranchCommits,
        listLocalBranches: () => Promise.resolve([{ name: 'master', ref: 'refs/heads/master' }]),
      },
      memory: {
        commitStates: (_repositoryId, shas) =>
          Promise.resolve(shas.map((sha) => ({ sha, indexed: false, reviewed: false }))),
      },
      repositoryId: 'repository_commit_explorer',
      repositoryRoot: 'D:/work/repository',
    });
    const second = await exploreCommits(input({ cursor: first.nextCursor ?? undefined }), {
      currentBranch: 'master',
      git: {
        listBranchCommits,
        listLocalBranches: () => Promise.resolve([{ name: 'master', ref: 'refs/heads/master' }]),
      },
      memory: {
        commitStates: (_repositoryId, shas) =>
          Promise.resolve(shas.map((sha) => ({ sha, indexed: false, reviewed: false }))),
      },
      repositoryId: 'repository_commit_explorer',
      repositoryRoot: 'D:/work/repository',
    });

    expect(first.commits).toHaveLength(24);
    expect(first.nextCursor).toBe(24);
    expect(second.commits.map(({ title }) => title)).toEqual(['Commit 25']);
    expect(second.nextCursor).toBeNull();
  });

  it('fails before Git history lookup when a selected local branch disappears', async () => {
    const listBranchCommits = vi.fn();

    await expect(
      exploreCommits(input({ branch: 'master' }), {
        currentBranch: 'feature/commit-explorer',
        git: {
          listBranchCommits,
          listLocalBranches: () =>
            Promise.resolve([
              { name: 'feature/commit-explorer', ref: 'refs/heads/feature/commit-explorer' },
            ]),
        },
        memory: { commitStates: () => Promise.resolve([]) },
        repositoryId: 'repository_commit_explorer',
        repositoryRoot: 'D:/work/repository',
      }),
    ).rejects.toBeInstanceOf(CommitExplorerBranchUnavailableError);
    expect(listBranchCommits).not.toHaveBeenCalled();
  });
});
