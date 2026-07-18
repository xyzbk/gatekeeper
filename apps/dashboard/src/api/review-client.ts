import { reviewRunSchema, type ReviewRunContract } from '@gatekeeper/contracts';

import { createBootstrapLoader, type BootstrapLoader } from './status-client.js';

export interface ReviewClient {
  getReview: (reviewId: string, signal?: AbortSignal) => Promise<ReviewRunContract>;
  reviewWorktree: (signal?: AbortSignal) => Promise<ReviewRunContract>;
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
  };
}
