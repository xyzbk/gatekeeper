// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import type { ReviewOperationContract } from '@gatekeeper/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PullRequestReviewRoute } from './pull-request-review-route.js';

afterEach(cleanup);

const queued: ReviewOperationContract = {
  schemaVersion: 1,
  reviewId: 'review_dashboard_pr_12',
  repositoryId: 'repository_dashboard_pr',
  target: { kind: 'pull_request', display: 'Pull request #12', pullRequestNumber: 12 },
  status: 'queued',
  stage: 'queued',
  createdAt: '2026-07-18T12:00:00.000Z',
  updatedAt: '2026-07-18T12:00:00.000Z',
};

function ProgressRoute() {
  const { reviewId } = useParams<{ reviewId: string }>();
  return <p>Progress route: {reviewId}</p>;
}

function renderRoute(
  startPullRequestReview: (pullRequestNumber: number) => Promise<ReviewOperationContract>,
  initialEntry = '/reviews/pull-request',
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            element={<PullRequestReviewRoute startPullRequestReview={startPullRequestReview} />}
            path="/reviews/pull-request"
          />
          <Route element={<ProgressRoute />} path="/reviews/:reviewId" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('pull-request Review Inspector entry', () => {
  it('starts with a labelled positive-number form and does not review on navigation', () => {
    const startPullRequestReview = vi.fn(() => Promise.resolve(queued));
    renderRoute(startPullRequestReview);

    expect(screen.getByRole('spinbutton', { name: 'Pull request number' })).toHaveAttribute(
      'min',
      '1',
    );
    expect(screen.getByRole('button', { name: 'Review pull request' })).toBeEnabled();
    expect(startPullRequestReview).not.toHaveBeenCalled();
  });

  it('starts once and immediately navigates to the durable progress route', async () => {
    const startPullRequestReview = vi.fn(() => Promise.resolve(queued));
    const user = userEvent.setup();
    renderRoute(startPullRequestReview);

    await user.type(screen.getByRole('spinbutton', { name: 'Pull request number' }), '12');
    await user.click(screen.getByRole('button', { name: 'Review pull request' }));

    expect(await screen.findByText(`Progress route: ${queued.reviewId}`)).toBeVisible();
    expect(startPullRequestReview).toHaveBeenCalledOnce();
    expect(startPullRequestReview).toHaveBeenCalledWith(12);
  });

  it('shows pending and bounded retryable start failures', async () => {
    const pending = vi.fn<() => Promise<ReviewOperationContract>>(
      () => new Promise(() => undefined),
    );
    const user = userEvent.setup();
    renderRoute(pending);
    await user.type(screen.getByRole('spinbutton', { name: 'Pull request number' }), '12');
    await user.click(screen.getByRole('button', { name: 'Review pull request' }));
    expect(screen.getByRole('button', { name: 'Starting review' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Creating a durable review');

    cleanup();
    const failing = vi
      .fn<(pullRequestNumber: number) => Promise<ReviewOperationContract>>()
      .mockRejectedValue(new Error('private GitHub body and token'));
    renderRoute(failing, '/reviews/pull-request?number=12');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Review pull request' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Gatekeeper could not start the pull-request review.',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('private GitHub body');
    expect(screen.getByRole('spinbutton', { name: 'Pull request number' })).toHaveValue(12);
  });
});
