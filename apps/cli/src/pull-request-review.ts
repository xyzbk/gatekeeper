import { randomUUID } from 'node:crypto';

import { loadRepositoryPolicy, type LoadedRepositoryPolicy } from '@gatekeeper/config';
import {
  changeSetSchema,
  reviewRunSchema,
  type GitHubRemote,
  type PullRequestRecord,
  type RepositorySnapshot,
  type ReviewRunContract,
} from '@gatekeeper/contracts';
import type { RepositoryId, ReviewId } from '@gatekeeper/domain';
import { createGitProvider } from '@gatekeeper/git-adapter';
import {
  createGitHubProvider,
  normalizeGitHubRemote,
  type GitHubProvider,
} from '@gatekeeper/github-gh';
import { reviewPullRequest } from '@gatekeeper/review-engine';

export interface PullRequestReviewContext {
  repositoryId: RepositoryId;
  previousReviewId?: ReviewId;
}

export interface PullRequestReviewResult {
  review: ReviewRunContract;
  pullRequest: PullRequestRecord;
  remote: GitHubRemote;
}

export interface PullRequestReviewDependencies {
  createReviewId: () => ReviewId;
  github: GitHubProvider;
  inspectRepository: (path: string) => Promise<RepositorySnapshot>;
  loadPolicy: (root: string) => Promise<LoadedRepositoryPolicy>;
  now: () => string;
}

const gitProvider = createGitProvider();

const defaultDependencies: PullRequestReviewDependencies = {
  createReviewId: () => `review_${randomUUID().replaceAll('-', '')}` as ReviewId,
  github: createGitHubProvider(),
  inspectRepository: (path) => gitProvider.inspectRepository(path),
  loadPolicy: (root) => loadRepositoryPolicy(root),
  now: () => new Date().toISOString(),
};

export async function runPullRequestReview(
  repositoryPath: string,
  pullRequestNumber: number,
  context: PullRequestReviewContext,
  dependencies: PullRequestReviewDependencies = defaultDependencies,
): Promise<PullRequestReviewResult> {
  if (!Number.isSafeInteger(pullRequestNumber) || pullRequestNumber <= 0) {
    throw new TypeError('Pull-request number must be a positive integer.');
  }
  const repository = await dependencies.inspectRepository(repositoryPath);
  if (repository.remote === null) {
    throw new TypeError('The repository has no origin remote.');
  }
  const remote = normalizeGitHubRemote(repository.remote);
  await dependencies.github.preflight(remote);
  const loadedPolicy = await dependencies.loadPolicy(repository.root);
  const [pullRequest, rawChangeSet] = await Promise.all([
    dependencies.github.getPullRequest(remote, pullRequestNumber),
    dependencies.github.getPullRequestDiff(remote, pullRequestNumber),
  ]);
  const changeSet = changeSetSchema.parse({
    ...rawChangeSet,
    target: {
      kind: 'pull_request',
      display: `Pull request #${pullRequestNumber}`,
      pullRequestNumber,
      base: pullRequest.baseRefName,
      head: pullRequest.headRefName,
    },
  });
  const review = reviewPullRequest({
    changeSet,
    pullRequest,
    createdAt: dependencies.now(),
    policy: loadedPolicy.policy,
    repositoryId: context.repositoryId,
    reviewId: dependencies.createReviewId(),
    ...(context.previousReviewId === undefined
      ? {}
      : { previousReviewId: context.previousReviewId }),
  });
  return { review: reviewRunSchema.parse(review), pullRequest, remote };
}
