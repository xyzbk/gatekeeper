import { reviewRunSchema, type ReviewRunContract } from '@gatekeeper/contracts';

import { createBootstrapLoader, type BootstrapLoader } from './status-client.js';

export interface ReviewClient {
  reviewWorktree: (signal?: AbortSignal) => Promise<ReviewRunContract>;
}

export function createReviewClient(
  fetcher: typeof fetch = globalThis.fetch,
  loadBootstrap: BootstrapLoader = createBootstrapLoader(fetcher),
): ReviewClient {
  return {
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
    },
  };
}
