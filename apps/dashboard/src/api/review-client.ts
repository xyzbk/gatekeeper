import {
  githubSyncResultSchema,
  repositoryRecordSchema,
  reviewRunSchema,
  type GitHubSyncResult,
  type ReviewRunContract,
} from '@gatekeeper/contracts';

import { createBootstrapLoader, type BootstrapLoader } from './status-client.js';

export interface ReviewClient {
  getReview: (reviewId: string, signal?: AbortSignal) => Promise<ReviewRunContract>;
  reviewPullRequest: (
    pullRequestNumber: number,
    signal?: AbortSignal,
  ) => Promise<PullRequestReviewResult>;
  reviewWorktree: (signal?: AbortSignal) => Promise<ReviewRunContract>;
}

export interface PullRequestReviewResult {
  review: ReviewRunContract;
  sync: GitHubSyncResult;
}

export type ReviewClientErrorCode = 'NOT_FOUND' | 'UNAVAILABLE';

export class ReviewClientError extends Error {
  public constructor(
    public readonly code: ReviewClientErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ReviewClientError';
  }
}

async function parseReviewResponse(response: Response): Promise<ReviewRunContract> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Gatekeeper review returned invalid JSON.');
  }
  const parsed = reviewRunSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error('Gatekeeper review returned an invalid response.');
  }
  return parsed.data;
}

export function createReviewClient(
  fetcher: typeof fetch = globalThis.fetch,
  loadBootstrap: BootstrapLoader = createBootstrapLoader(fetcher),
): ReviewClient {
  return {
    getReview: async (reviewId, signal) => {
      const bootstrap = await loadBootstrap(signal);
      const response = await fetcher(
        `${bootstrap.apiBaseUrl}/reviews/${encodeURIComponent(reviewId)}`,
        {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Authorization: `Bearer ${bootstrap.bearerToken}` },
          method: 'GET',
          ...(signal === undefined ? {} : { signal }),
        },
      );
      if (response.status === 404) {
        throw new ReviewClientError('NOT_FOUND', 'Stored review not found.');
      }
      if (!response.ok) {
        throw new ReviewClientError('UNAVAILABLE', 'Stored review is unavailable.');
      }
      return parseReviewResponse(response);
    },
    reviewWorktree: async (signal) => {
      const bootstrap = await loadBootstrap(signal);
      const response = await fetcher(`${bootstrap.apiBaseUrl}/reviews/worktree`, {
        body: '{}',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          Authorization: `Bearer ${bootstrap.bearerToken}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
        ...(signal === undefined ? {} : { signal }),
      });
      if (!response.ok) {
        throw new Error('Gatekeeper review is unavailable.');
      }

      return parseReviewResponse(response);
    },
    reviewPullRequest: async (pullRequestNumber, signal) => {
      if (!Number.isSafeInteger(pullRequestNumber) || pullRequestNumber <= 0) {
        throw new TypeError('Pull-request number must be a positive integer.');
      }
      const bootstrap = await loadBootstrap(signal);
      const headers = {
        Authorization: `Bearer ${bootstrap.bearerToken}`,
        'Content-Type': 'application/json',
      };
      const repositoryResponse = await fetcher(`${bootstrap.apiBaseUrl}/repositories`, {
        body: '{}',
        cache: 'no-store',
        credentials: 'same-origin',
        headers,
        method: 'POST',
        ...(signal === undefined ? {} : { signal }),
      });
      if (!repositoryResponse.ok) {
        throw new Error('Gatekeeper pull-request review is unavailable.');
      }
      const repository = repositoryRecordSchema.safeParse(await repositoryResponse.json());
      if (!repository.success) {
        throw new Error('Gatekeeper returned an invalid repository response.');
      }
      const syncResponse = await fetcher(
        `${bootstrap.apiBaseUrl}/repositories/${encodeURIComponent(repository.data.repositoryId)}/sync/github`,
        {
          body: '{}',
          cache: 'no-store',
          credentials: 'same-origin',
          headers,
          method: 'POST',
          ...(signal === undefined ? {} : { signal }),
        },
      );
      if (!syncResponse.ok) {
        throw new Error('Gatekeeper GitHub history sync is unavailable.');
      }
      const sync = githubSyncResultSchema.safeParse(await syncResponse.json());
      if (!sync.success) {
        throw new Error('Gatekeeper returned an invalid GitHub sync response.');
      }
      const reviewResponse = await fetcher(`${bootstrap.apiBaseUrl}/reviews/pull-request`, {
        body: JSON.stringify({ schemaVersion: 1, pullRequestNumber }),
        cache: 'no-store',
        credentials: 'same-origin',
        headers,
        method: 'POST',
        ...(signal === undefined ? {} : { signal }),
      });
      if (!reviewResponse.ok) {
        throw new Error('Gatekeeper pull-request review is unavailable.');
      }
      return { review: await parseReviewResponse(reviewResponse), sync: sync.data };
    },
  };
}
