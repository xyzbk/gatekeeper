import type { ChangeSet, RepositorySnapshot } from '@gatekeeper/contracts';
import type { RepositoryId, ReviewId } from '@gatekeeper/domain';
import { describe, expect, it, vi } from 'vitest';

import { runCommitReview } from './commit-review.js';

const sha = 'a'.repeat(40);
const repository: RepositorySnapshot = {
  root: '/target/repository',
  branch: 'master',
  head: sha,
  dirty: false,
  remote: null,
};

const changes: ChangeSet = {
  schemaVersion: 1,
  target: {
    kind: 'commit_range',
    display: `Commit ${sha.slice(0, 12)}`,
    base: 'b'.repeat(40),
    head: sha,
  },
  files: [
    {
      path: 'src/app.ts',
      status: 'modified',
      additions: 1,
      deletions: 0,
      binary: false,
      contentTruncated: false,
      addedLines: ['export const changed = true;'],
    },
  ],
};

describe('runCommitReview', () => {
  it('loads current policy and reviews the immutable selected commit', async () => {
    const getCommitDiff = vi.fn(() => Promise.resolve(changes));
    const result = await runCommitReview('.', sha, {
      createRepositoryId: () => 'repository_test' as RepositoryId,
      createReviewId: () => 'review_test' as ReviewId,
      getCommitDiff,
      inspectRepository: () => Promise.resolve(repository),
      loadPolicy: () =>
        Promise.resolve({
          path: '/target/repository/.gatekeeper/policies.yaml',
          policy: { version: 1 as const, paths: { ignore: ['dist/**'] } },
          source: 'file' as const,
        }),
      now: () => '2026-07-19T12:00:00.000Z',
    });

    expect(getCommitDiff).toHaveBeenCalledWith(repository.root, sha, {
      ignorePatterns: ['dist/**'],
    });
    expect(result.target).toEqual(changes.target);
    expect(result.repositoryId).toBe('repository_test');
  });
});
