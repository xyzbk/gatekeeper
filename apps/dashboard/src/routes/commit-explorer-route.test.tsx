// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import type {
  CommitExplorerInput,
  CommitExplorerResponse,
  ReviewOperationContract,
} from '@gatekeeper/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

const sha = 'd'.repeat(40);
const queued: ReviewOperationContract = {
  schemaVersion: 1,
  reviewId: 'review_commit_explorer_test',
  repositoryId: 'repository_commit_explorer_test',
  target: { kind: 'commit_range', display: `Commit ${sha.slice(0, 12)}`, head: sha },
  status: 'queued',
  stage: 'queued',
  createdAt: '2026-07-19T12:00:00.000Z',
  updatedAt: '2026-07-19T12:00:00.000Z',
};

function response(overrides: Partial<CommitExplorerResponse> = {}): CommitExplorerResponse {
  return {
    schemaVersion: 1,
    branches: ['master', 'feature/local-history'],
    selection: {
      schemaVersion: 1,
      branch: 'master',
      source: 'all_local',
      reviewState: 'all',
      sort: 'newest',
    },
    commits: [
      {
        sha,
        authoredAt: '2026-07-19T13:00:00.000Z',
        title: 'Preserve historical review identity',
        indexed: true,
        reviewed: true,
      },
    ],
    nextCursor: 24,
    ...overrides,
  };
}

async function renderExplorer(
  options: {
    exploreCommits?: (input: CommitExplorerInput) => Promise<CommitExplorerResponse>;
    startCommitReview?: (commitSha: string) => Promise<ReviewOperationContract>;
  } = {},
) {
  const { CommitExplorerRoute } = await import('./commit-explorer-route.js');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/commits']}>
        <Routes>
          <Route
            element={
              <CommitExplorerRoute
                exploreCommits={options.exploreCommits ?? (() => Promise.resolve(response()))}
                startCommitReview={options.startCommitReview ?? (() => Promise.resolve(queued))}
              />
            }
            path="/commits"
          />
          <Route element={<p>Review detail</p>} path="/reviews/:reviewId" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Commit Explorer', () => {
  it('defaults to local master history and starts the existing strict commit review from a card', async () => {
    const exploreCommits = vi.fn<(input: CommitExplorerInput) => Promise<CommitExplorerResponse>>(
      () => Promise.resolve(response()),
    );
    const startCommitReview = vi.fn<(commitSha: string) => Promise<ReviewOperationContract>>(() =>
      Promise.resolve(queued),
    );
    const user = userEvent.setup();
    await renderExplorer({ exploreCommits, startCommitReview });

    expect(await screen.findByRole('heading', { name: 'Browse local commits' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Branch' })).toHaveValue('master');
    expect(exploreCommits).toHaveBeenCalledWith(
      {
        schemaVersion: 1,
        source: 'all_local',
        reviewState: 'all',
        sort: 'newest',
      },
      expect.any(AbortSignal),
    );

    await user.click(
      screen.getByRole('button', { name: /Review Preserve historical review identity/ }),
    );
    expect(startCommitReview).toHaveBeenCalledWith(sha);
    expect(await screen.findByText('Review detail')).toBeVisible();
  });

  it('keeps source and filters in scope while paginating forward and backward', async () => {
    const exploreCommits = vi.fn<(input: CommitExplorerInput) => Promise<CommitExplorerResponse>>(
      (input) =>
        Promise.resolve(
          input.cursor === 24
            ? response({
                commits: [
                  {
                    sha: 'e'.repeat(40),
                    authoredAt: '2026-07-18T13:00:00.000Z',
                    title: 'Second local commit',
                    indexed: false,
                    reviewed: false,
                  },
                ],
                nextCursor: null,
              })
            : response(),
        ),
    );
    const user = userEvent.setup();
    await renderExplorer({ exploreCommits });
    await screen.findByText('Preserve historical review identity');

    await user.click(screen.getByRole('radio', { name: 'Project Memory' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search commits' }), 'identity');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(await screen.findByText('Preserve historical review identity')).toBeVisible();
    expect(exploreCommits).toHaveBeenLastCalledWith(
      {
        schemaVersion: 1,
        branch: 'master',
        source: 'project_memory',
        query: 'identity',
        reviewState: 'all',
        sort: 'newest',
      },
      expect.any(AbortSignal),
    );

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Second local commit')).toBeVisible();
    expect(exploreCommits).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 24, source: 'project_memory', query: 'identity' }),
      expect.any(AbortSignal),
    );
    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(await screen.findByText('Preserve historical review identity')).toBeVisible();
  });

  it('keeps service and review-start failures bounded', async () => {
    const exploreCommits = vi
      .fn<(input: CommitExplorerInput) => Promise<CommitExplorerResponse>>()
      .mockRejectedValue(new Error('private repository data'));
    await renderExplorer({ exploreCommits });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Local commits could not be loaded.',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('private repository data');
  });

  it('keeps review-start failures bounded without disabling the explorer', async () => {
    const startCommitReview = vi
      .fn<(commitSha: string) => Promise<ReviewOperationContract>>()
      .mockRejectedValue(new Error('private commit detail'));
    const user = userEvent.setup();
    await renderExplorer({ startCommitReview });
    await user.click(
      await screen.findByRole('button', { name: /Review Preserve historical review identity/ }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Gatekeeper could not start the historical review.',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('private commit detail');
    expect(
      screen.getByRole('button', { name: /Review Preserve historical review identity/ }),
    ).toBeEnabled();
  });
});
