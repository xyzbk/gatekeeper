// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import type {
  PullRequestExplorerInput,
  PullRequestExplorerResponse,
  ReviewOperationContract,
} from '@gatekeeper/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PullRequestExplorerRoute } from './pull-request-explorer-route.js';

afterEach(cleanup);

const response: PullRequestExplorerResponse = {
  schemaVersion: 1,
  selection: {
    schemaVersion: 1,
    repositoryId: 'repository_dashboard_pr_explorer',
    state: 'all',
    reviewState: 'all',
    sort: 'newest',
  },
  pullRequests: [
    {
      number: 12,
      title: 'Restore mandatory Redis cache',
      state: 'closed',
      updatedAt: '2026-07-20T12:00:00.000Z',
      reviewed: false,
      trust: 'untrusted_repository_content',
      evidence: {
        sourceType: 'pull_request',
        repositoryId: 'repository_dashboard_pr_explorer',
        sourceId: 'pull_request:12',
        title: 'Restore mandatory Redis cache',
        remoteUrl: 'https://github.com/example/gatekeeper/pull/12',
        contentHash: 'a'.repeat(64),
      },
    },
  ],
  nextCursor: 24,
};

const operation: ReviewOperationContract = {
  schemaVersion: 1,
  reviewId: 'review_dashboard_pr_explorer',
  repositoryId: 'repository_dashboard_pr_explorer',
  target: { kind: 'pull_request', display: 'Pull request #12', pullRequestNumber: 12 },
  status: 'queued',
  stage: 'queued',
  createdAt: '2026-07-20T12:00:00.000Z',
  updatedAt: '2026-07-20T12:00:00.000Z',
};

function ReviewRoute() {
  const { reviewId } = useParams<{ reviewId: string }>();
  return <p>Review route: {reviewId}</p>;
}

function renderRoute(
  explorePullRequests: (input: Omit<PullRequestExplorerInput, 'repositoryId'>) => Promise<PullRequestExplorerResponse>,
  startPullRequestReview: (number: number) => Promise<ReviewOperationContract>,
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/pull-requests']}>
        <Routes>
          <Route
            element={
              <PullRequestExplorerRoute
                explorePullRequests={explorePullRequests}
                startPullRequestReview={startPullRequestReview}
              />
            }
            path="/pull-requests"
          />
          <Route element={<ReviewRoute />} path="/reviews/:reviewId" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Pull Request Explorer', () => {
  it('lists bounded untrusted evidence and only reviews after an explicit action', async () => {
    const explorePullRequests = vi.fn(() => Promise.resolve(response));
    const startPullRequestReview = vi.fn(() => Promise.resolve(operation));
    const user = userEvent.setup();
    renderRoute(explorePullRequests, startPullRequestReview);

    expect(await screen.findByRole('heading', { name: 'Browse pull requests' })).toBeVisible();
    expect(await screen.findByText('Restore mandatory Redis cache')).toBeVisible();
    expect(screen.getByText('Untrusted repository content')).toBeVisible();
    expect(startPullRequestReview).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Review pull request #12' }));
    expect(await screen.findByText(`Review route: ${operation.reviewId}`)).toBeVisible();
    expect(startPullRequestReview).toHaveBeenCalledWith(12);
  });

  it('applies bounded filters and pages only when the user submits them', async () => {
    const explorePullRequests = vi.fn(() => Promise.resolve(response));
    const user = userEvent.setup();
    renderRoute(explorePullRequests, () => Promise.resolve(operation));
    await screen.findByRole('heading', { name: 'Browse pull requests' });

    await user.type(screen.getByRole('searchbox', { name: 'Search pull requests' }), 'redis');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Pull request state' }), 'closed');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(explorePullRequests).toHaveBeenLastCalledWith({
      schemaVersion: 1,
      query: 'redis',
      state: 'closed',
      reviewState: 'all',
      sort: 'newest',
    }, expect.any(AbortSignal));

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(explorePullRequests).toHaveBeenLastCalledWith({
      schemaVersion: 1,
      cursor: 24,
      query: 'redis',
      state: 'closed',
      reviewState: 'all',
      sort: 'newest',
    }, expect.any(AbortSignal));
  });
});
