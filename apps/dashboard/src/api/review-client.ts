import {
  reviewLookupSchema,
  reviewOperationSchema,
  type ReviewLookupContract,
  type ReviewOperationContract,
} from '@gatekeeper/contracts';

import { createBootstrapLoader, type BootstrapLoader } from './status-client.js';

export interface ReviewClient {
  getReview: (reviewId: string, signal?: AbortSignal) => Promise<ReviewLookupContract>;
  startCommitReview: (sha: string, signal?: AbortSignal) => Promise<ReviewOperationContract>;
  startPullRequestReview: (
    pullRequestNumber: number,
    signal?: AbortSignal,
  ) => Promise<ReviewOperationContract>;
  startWorktreeReview: (signal?: AbortSignal) => Promise<ReviewOperationContract>;
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

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error('Gatekeeper review returned invalid JSON.');
  }
}

async function parseReviewLookup(response: Response): Promise<ReviewLookupContract> {
  const parsed = reviewLookupSchema.safeParse(await responseJson(response));
  if (!parsed.success) {
    throw new Error('Gatekeeper review returned an invalid response.');
  }
  return parsed.data;
}

async function parseReviewOperation(response: Response): Promise<ReviewOperationContract> {
  const parsed = reviewOperationSchema.safeParse(await responseJson(response));
  if (!parsed.success) {
    throw new Error('Gatekeeper review returned an invalid response.');
  }
  return parsed.data;
}

export function createReviewClient(
  fetcher: typeof fetch = globalThis.fetch,
  loadBootstrap: BootstrapLoader = createBootstrapLoader(fetcher),
): ReviewClient {
  const start = async (
    path: string,
    body: string,
    signal?: AbortSignal,
  ): Promise<ReviewOperationContract> => {
    const bootstrap = await loadBootstrap(signal);
    const response = await fetcher(`${bootstrap.apiBaseUrl}${path}`, {
      body,
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
      throw new ReviewClientError('UNAVAILABLE', 'Gatekeeper review is unavailable.');
    }
    return parseReviewOperation(response);
  };

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
      return parseReviewLookup(response);
    },
    startPullRequestReview: (pullRequestNumber, signal) => {
      if (!Number.isSafeInteger(pullRequestNumber) || pullRequestNumber <= 0) {
        return Promise.reject(new TypeError('Pull-request number must be a positive integer.'));
      }
      return start(
        '/reviews/pull-request/start',
        JSON.stringify({ schemaVersion: 1, pullRequestNumber }),
        signal,
      );
    },
    startCommitReview: (sha, signal) => {
      if (!/^[0-9a-f]{40,64}$/.test(sha)) {
        return Promise.reject(new TypeError('Commit SHA must be a full lowercase Git object ID.'));
      }
      return start('/reviews/commit/start', JSON.stringify({ schemaVersion: 1, sha }), signal);
    },
    startWorktreeReview: (signal) => start('/reviews/worktree/start', '{}', signal),
  };
}
