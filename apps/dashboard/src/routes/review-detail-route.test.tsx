// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import type {
  ReviewLookupContract,
  ReviewOperationContract,
  ReviewRunContract,
} from '@gatekeeper/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReviewClientError } from '../api/review-client.js';
import { ReviewDetailRoute } from './review-detail-route.js';

afterEach(cleanup);

const review: ReviewRunContract = {
  schemaVersion: 1,
  reviewId: 'review_detail',
  repositoryId: 'repository_detail',
  target: { kind: 'worktree', display: 'Current worktree' },
  verdict: 'FAST_PATH',
  summary: 'FAST_PATH: local review complete.',
  findings: [],
  metrics: { filesChanged: 0, linesAdded: 0, linesDeleted: 0, pathGroups: [] },
  changes: [],
  createdAt: '2026-07-19T00:00:00.000Z',
};
const queued: ReviewOperationContract = {
  schemaVersion: 1,
  reviewId: review.reviewId,
  repositoryId: review.repositoryId,
  target: review.target,
  status: 'queued',
  stage: 'queued',
  createdAt: review.createdAt,
  updatedAt: review.createdAt,
};
const running: ReviewOperationContract = {
  ...queued,
  status: 'running',
  stage: 'evaluating_change',
};
const completed: ReviewOperationContract = {
  ...queued,
  status: 'completed',
  stage: 'completed',
  review,
  previousReview: null,
  historySync: null,
  evidenceTimeline: [],
};

function renderRoute(
  getReview: (reviewId: string, signal?: AbortSignal) => Promise<ReviewLookupContract>,
  startPullRequestReview: (pullRequestNumber: number) => Promise<ReviewOperationContract> = () =>
    Promise.resolve(queued),
  startWorktreeReview: () => Promise<ReviewOperationContract> = () => Promise.resolve(queued),
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/reviews/${review.reviewId}`]}>
        <Routes>
          <Route
            element={
              <ReviewDetailRoute
                getReview={getReview}
                startPullRequestReview={startPullRequestReview}
                startWorktreeReview={startWorktreeReview}
              />
            }
            path="/reviews/:reviewId"
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('review detail route', () => {
  it('polls bounded operation stages until the completed inspector is available', async () => {
    const getReview = vi
      .fn<(reviewId: string) => Promise<ReviewLookupContract>>()
      .mockResolvedValueOnce(queued)
      .mockResolvedValueOnce(running)
      .mockResolvedValue(completed);
    renderRoute(getReview);

    expect(await screen.findByRole('status', { name: 'Review progress' })).toHaveTextContent(
      'Queued for local review',
    );
    expect(await screen.findByText('Evaluating the change')).toBeVisible();
    expect(await screen.findByRole('heading', { level: 1, name: 'FAST_PATH' })).toBeVisible();
    expect(getReview.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('renders persisted failure and offline states without leaking details', async () => {
    renderRoute(() =>
      Promise.resolve({
        ...queued,
        status: 'failed',
        stage: 'failed',
        error: {
          code: 'REVIEW_FAILED',
          message: 'Gatekeeper could not complete the local review.',
          repair: 'Confirm local tools are ready, then retry.',
        },
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Review did not complete' })).toBeVisible();
    expect(screen.getByText('Gatekeeper could not complete the local review.')).toBeVisible();

    cleanup();
    const getReview = vi
      .fn<(reviewId: string) => Promise<ReviewLookupContract>>()
      .mockRejectedValueOnce(new Error('private database and token detail'))
      .mockResolvedValue(completed);
    renderRoute(getReview);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Stored review could not be loaded.',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('private database');
  });

  it('supports legacy ReviewRun deep links and missing review IDs', async () => {
    renderRoute(() => Promise.resolve(review));
    expect(await screen.findByRole('heading', { level: 1, name: 'FAST_PATH' })).toBeVisible();

    cleanup();
    renderRoute(() =>
      Promise.reject(new ReviewClientError('NOT_FOUND', 'Stored review not found.')),
    );
    expect(await screen.findByRole('heading', { name: 'Review not found' })).toBeVisible();
  });
});
