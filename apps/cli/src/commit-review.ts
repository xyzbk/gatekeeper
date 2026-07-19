import { randomUUID } from 'node:crypto';

import { loadRepositoryPolicy, type LoadedRepositoryPolicy } from '@gatekeeper/config';
import type { ChangeSet, RepositorySnapshot, ReviewRunContract } from '@gatekeeper/contracts';
import type { RepositoryId, ReviewId } from '@gatekeeper/domain';
import { createGitProvider, type WorktreeDiffOptions } from '@gatekeeper/git-adapter';
import { createLocalRepositoryId, reviewCommit } from '@gatekeeper/review-engine';

export interface CommitReviewDependencies {
  createRepositoryId: (canonicalRoot: string) => RepositoryId;
  createReviewId: () => ReviewId;
  getCommitDiff: (root: string, sha: string, options?: WorktreeDiffOptions) => Promise<ChangeSet>;
  inspectRepository: (path: string) => Promise<RepositorySnapshot>;
  loadPolicy: (root: string) => Promise<LoadedRepositoryPolicy>;
  now: () => string;
}

export interface CommitReviewContext {
  repositoryId: RepositoryId;
  previousReviewId?: ReviewId;
  reviewId?: ReviewId;
}

const gitProvider = createGitProvider();

const defaultDependencies: CommitReviewDependencies = {
  createRepositoryId: createLocalRepositoryId,
  createReviewId: () => `review_${randomUUID().replaceAll('-', '')}` as ReviewId,
  getCommitDiff: (root, sha, options) => gitProvider.getCommitDiff(root, sha, options),
  inspectRepository: (path) => gitProvider.inspectRepository(path),
  loadPolicy: (root) => loadRepositoryPolicy(root),
  now: () => new Date().toISOString(),
};

export async function runCommitReview(
  repositoryPath: string,
  sha: string,
  dependencies: CommitReviewDependencies = defaultDependencies,
  context?: CommitReviewContext,
): Promise<ReviewRunContract> {
  const repository = await dependencies.inspectRepository(repositoryPath);
  const loadedPolicy = await dependencies.loadPolicy(repository.root);
  const changeSet = await dependencies.getCommitDiff(repository.root, sha, {
    ignorePatterns: loadedPolicy.policy.paths?.ignore ?? [],
  });
  return reviewCommit({
    changeSet,
    createdAt: dependencies.now(),
    policy: loadedPolicy.policy,
    repositoryId: context?.repositoryId ?? dependencies.createRepositoryId(repository.root),
    reviewId: context?.reviewId ?? dependencies.createReviewId(),
    ...(context?.previousReviewId === undefined
      ? {}
      : { previousReviewId: context.previousReviewId }),
  });
}
