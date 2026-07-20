// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import type {
  CommitExplorerInput,
  CommitExplorerResponse,
  GitHubSyncResult,
  IndexResult,
  MemorySearchResult,
  PullRequestExplorerInput,
  PullRequestExplorerResponse,
  RecentCommitEvidence,
  RepositoryStatus,
  ReviewLookupContract,
  ReviewOperationContract,
  ReviewRunContract,
  StatusResponse,
} from '@gatekeeper/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

const status: StatusResponse = {
  schemaVersion: 1,
  service: {
    state: 'ready',
    version: '0.1.0',
    startedAt: '2026-07-17T00:00:00.000Z',
    baseUrl: 'http://127.0.0.1:43127',
  },
  repository: {
    root: 'D:\\work\\gatekeeper',
    branch: 'master',
    head: 'b'.repeat(40),
    dirty: false,
    remote: 'https://github.com/xyzbk/gatekeeper.git',
  },
  tools: {
    git: { available: true, version: 'git version 2.50.1' },
    gh: { available: false, version: null },
  },
  features: { modelReasoning: 'disabled', projectMemory: 'not_initialized' },
  paths: {
    appData: 'C:\\Users\\developer\\AppData\\Local\\Gatekeeper',
    serviceMetadata: 'C:\\Users\\developer\\AppData\\Local\\Gatekeeper\\service.json',
    storage: 'C:\\Users\\developer\\AppData\\Local\\Gatekeeper\\storage',
  },
};

const review: ReviewRunContract = {
  schemaVersion: 1,
  reviewId: 'review_dashboard_test',
  repositoryId: 'repository_dashboard_test',
  target: { kind: 'worktree', display: 'Current worktree' },
  verdict: 'REQUIRE_CHANGES',
  summary: 'REQUIRE_CHANGES: 1 changed file.',
  findings: [],
  metrics: {
    filesChanged: 1,
    linesAdded: 2,
    linesDeleted: 1,
    pathGroups: [{ name: 'src', count: 1 }],
  },
  changes: [
    {
      path: 'src/app.ts',
      status: 'modified',
      additions: 2,
      deletions: 1,
      binary: false,
      contentTruncated: false,
    },
  ],
  createdAt: '2026-07-18T12:00:00.000Z',
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

const memoryResult: MemorySearchResult = {
  documentId: 'document_dashboard_test',
  match: 'linked',
  relationship: 'supersedes',
  trust: 'untrusted_repository_content',
  status: 'active',
  occurredAt: '2026-07-17T09:00:00.000Z',
  evidence: {
    sourceType: 'adr',
    repositoryId: review.repositoryId,
    sourceId: 'docs/adr/0003-no-required-redis.md',
    path: 'docs/adr/0003-no-required-redis.md',
    excerpt: 'Redis is not required for the local cache.',
  },
};

const recentCommits: RecentCommitEvidence[] = [
  {
    sha: 'c'.repeat(40),
    authoredAt: '2026-07-19T12:00:00.000Z',
    title: 'Add historical commit review',
  },
];

const localCommits: CommitExplorerResponse = {
  schemaVersion: 1,
  branches: ['master'],
  selection: {
    schemaVersion: 1,
    branch: 'master',
    source: 'all_local',
    reviewState: 'all',
    sort: 'newest',
  },
  commits: [],
  nextCursor: null,
};

const memoryStatus: RepositoryStatus = {
  schemaVersion: 1,
  state: 'not_initialized',
  repository: null,
  indexState: null,
};

const indexResult: IndexResult = {
  schemaVersion: 1,
  repositoryId: review.repositoryId,
  head: status.repository.head,
  indexedAt: review.createdAt,
  files: { scanned: 0, written: 0, unchanged: 0, deleted: 0 },
  documents: { scanned: 0, written: 0, unchanged: 0, deleted: 0 },
  commits: { scanned: 0, written: 0, unchanged: 0, deleted: 0 },
};

const syncResult: GitHubSyncResult = {
  schemaVersion: 1,
  repositoryId: review.repositoryId,
  provider: 'github',
  syncedAt: review.createdAt,
  cursor: null,
  partial: false,
  documents: { received: 0, written: 0, unchanged: 0 },
  links: { received: 0, written: 0, unchanged: 0 },
  failures: [],
};

const pullRequests: PullRequestExplorerResponse = {
  schemaVersion: 1,
  selection: {
    schemaVersion: 1,
    repositoryId: review.repositoryId,
    state: 'all',
    reviewState: 'all',
    sort: 'newest',
  },
  pullRequests: [],
  nextCursor: null,
};

interface RenderOptions {
  exploreCommits?: (input: CommitExplorerInput) => Promise<CommitExplorerResponse>;
  explorePullRequests?: (
    input: Omit<PullRequestExplorerInput, 'repositoryId'>,
  ) => Promise<PullRequestExplorerResponse>;
  getMemoryStatus?: () => Promise<RepositoryStatus>;
  getReview?: (reviewId: string) => Promise<ReviewLookupContract>;
  initialEntry?: string;
  loadStatus?: () => Promise<StatusResponse>;
  indexLocalMemory?: () => Promise<IndexResult>;
  searchMemory?: (query: string) => Promise<MemorySearchResult[]>;
  recentCommits?: () => Promise<RecentCommitEvidence[]>;
  startCommitReview?: (sha: string) => Promise<ReviewOperationContract>;
  startPullRequestReview?: (pullRequestNumber: number) => Promise<ReviewOperationContract>;
  startWorktreeReview?: () => Promise<ReviewOperationContract>;
  syncGitHubHistory?: () => Promise<GitHubSyncResult>;
}

async function renderDashboard(options: RenderOptions = {}) {
  const { DashboardApp } = await import('./dashboard-app.js');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const pullRequestOperation: ReviewOperationContract = {
    ...queued,
    target: { kind: 'pull_request', display: 'Pull request #12', pullRequestNumber: 12 },
  };
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[options.initialEntry ?? '/']}>
        <DashboardApp
          exploreCommits={options.exploreCommits ?? (() => Promise.resolve(localCommits))}
          explorePullRequests={options.explorePullRequests ?? (() => Promise.resolve(pullRequests))}
          getReview={options.getReview ?? (() => Promise.resolve(review))}
          getMemoryStatus={options.getMemoryStatus ?? (() => Promise.resolve(memoryStatus))}
          indexLocalMemory={options.indexLocalMemory ?? (() => Promise.resolve(indexResult))}
          loadStatus={options.loadStatus ?? (() => Promise.resolve(status))}
          searchMemory={options.searchMemory ?? (() => Promise.resolve([memoryResult]))}
          syncGitHubHistory={options.syncGitHubHistory ?? (() => Promise.resolve(syncResult))}
          recentCommits={options.recentCommits ?? (() => Promise.resolve(recentCommits))}
          startCommitReview={options.startCommitReview ?? (() => Promise.resolve(queued))}
          startPullRequestReview={
            options.startPullRequestReview ?? (() => Promise.resolve(pullRequestOperation))
          }
          startWorktreeReview={options.startWorktreeReview ?? (() => Promise.resolve(queued))}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('dashboard application shell', () => {
  it('renders loading, real status, and keyboard-first navigation', async () => {
    await renderDashboard({ loadStatus: () => new Promise(() => undefined) });
    expect(screen.getByRole('status', { name: /Reading repository status/ })).toBeVisible();

    cleanup();
    const user = userEvent.setup();
    await renderDashboard();
    expect(await screen.findByRole('heading', { level: 1, name: 'gatekeeper' })).toBeVisible();
    expect(screen.getAllByText(status.repository.root)).toHaveLength(2);
    expect(screen.getAllByText(status.repository.head)).toHaveLength(2);
    await user.tab();
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveFocus();
  });

  it('renders recoverable status and focused not-found states', async () => {
    const loadStatus = vi
      .fn<() => Promise<StatusResponse>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(status);
    await renderDashboard({ loadStatus });
    const user = userEvent.setup();
    expect(await screen.findByRole('alert')).not.toHaveTextContent('offline');
    await user.click(screen.getByRole('button', { name: 'Retry status request' }));
    expect(await screen.findByRole('heading', { name: 'gatekeeper' })).toBeVisible();

    cleanup();
    await renderDashboard({ initialEntry: '/unknown' });
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });

  it('keeps the last repository control result while navigating the dashboard', async () => {
    const user = userEvent.setup();
    await renderDashboard();

    await screen.findByRole('heading', { name: 'Repository Control' });
    await user.click(screen.getByRole('button', { name: 'Index local memory' }));
    expect(await screen.findByText('Indexed 0 files, 0 documents, and 0 commits.')).toBeVisible();

    await user.click(screen.getByRole('link', { name: 'Pull request evidence' }));
    await screen.findByRole('heading', { name: 'Browse pull requests' });
    await user.click(screen.getByRole('link', { name: 'Repository overview' }));

    expect(await screen.findByText('Indexed 0 files, 0 documents, and 0 commits.')).toBeVisible();
  });

  it('supports direct entry to the pull-request inspector', async () => {
    await renderDashboard({ initialEntry: '/reviews/pull-request' });
    expect(screen.getByRole('heading', { name: 'Review a GitHub pull request' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Pull request evidence' })).not.toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('supports direct entry to the local Commit Explorer', async () => {
    await renderDashboard({ initialEntry: '/commits' });
    expect(await screen.findByRole('heading', { name: 'Browse local commits' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Local commits' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('supports direct entry to the Pull Request Explorer', async () => {
    await renderDashboard({ initialEntry: '/pull-requests' });
    expect(await screen.findByRole('heading', { name: 'Browse pull requests' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Pull request evidence' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

describe('Project Memory search', () => {
  it('does not search on navigation and searches on submit', async () => {
    const searchMemory = vi.fn(() => Promise.resolve([memoryResult]));
    const user = userEvent.setup();
    await renderDashboard({ initialEntry: '/memory', searchMemory });
    expect(await screen.findByText('Add historical commit review')).toBeVisible();
    expect(searchMemory).not.toHaveBeenCalled();
    await user.type(screen.getByRole('searchbox', { name: 'Evidence query' }), 'redis cache');
    await user.click(screen.getByRole('button', { name: 'Search memory' }));
    expect(await screen.findByText(memoryResult.evidence.excerpt ?? '')).toBeVisible();
    expect(screen.getByText('Relationship: supersedes')).toBeVisible();
    expect(searchMemory).toHaveBeenCalledWith('redis cache');
    expect(screen.queryByText('Add historical commit review')).not.toBeInTheDocument();
  });

  it('starts a historical commit review from the recent evidence grid', async () => {
    const startCommitReview = vi.fn(() => Promise.resolve(queued));
    const user = userEvent.setup();
    await renderDashboard({ initialEntry: '/memory', startCommitReview });
    await user.click(await screen.findByRole('button', { name: 'Review commit' }));
    expect(startCommitReview).toHaveBeenCalledWith('c'.repeat(40));
  });

  it('auto-runs only an explicit timeline query from the URL', async () => {
    const searchMemory = vi.fn(() => Promise.resolve([memoryResult]));
    await renderDashboard({
      initialEntry: '/memory?query=docs%2Fadr%2F0003-no-required-redis.md',
      searchMemory,
    });
    expect(await screen.findByText(memoryResult.evidence.excerpt ?? '')).toBeVisible();
    expect(searchMemory).toHaveBeenCalledWith('docs/adr/0003-no-required-redis.md');
  });

  it('shows bounded retryable errors', async () => {
    const searchMemory = vi
      .fn<(query: string) => Promise<MemorySearchResult[]>>()
      .mockRejectedValueOnce(new Error('private indexed content'))
      .mockResolvedValue([memoryResult]);
    const user = userEvent.setup();
    await renderDashboard({ initialEntry: '/memory', searchMemory });
    await user.type(screen.getByRole('searchbox', { name: 'Evidence query' }), 'redis');
    await user.click(screen.getByRole('button', { name: 'Search memory' }));
    expect(await screen.findByRole('alert')).not.toHaveTextContent('private indexed content');
    await user.click(screen.getByRole('button', { name: 'Retry search' }));
    expect(await screen.findByText(memoryResult.evidence.excerpt ?? '')).toBeVisible();
  });
});

describe('review routes', () => {
  it('loads legacy persisted reviews through the completed inspector', async () => {
    const getReview = vi.fn(() => Promise.resolve(review));
    await renderDashboard({ initialEntry: `/reviews/${review.reviewId}`, getReview });
    expect(await screen.findByRole('heading', { name: 'REQUIRE_CHANGES' })).toBeVisible();
    expect(screen.getByText(`Review ID: ${review.reviewId}`)).toBeVisible();
    expect(getReview).toHaveBeenCalledWith(review.reviewId, expect.any(AbortSignal));
  });

  it('starts a worktree review once and navigates to its durable route', async () => {
    const startWorktreeReview = vi.fn(() => Promise.resolve(queued));
    const user = userEvent.setup();
    await renderDashboard({ initialEntry: '/reviews/worktree', startWorktreeReview });
    expect(startWorktreeReview).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Run worktree review' }));
    expect(await screen.findByRole('heading', { name: 'REQUIRE_CHANGES' })).toBeVisible();
    expect(startWorktreeReview).toHaveBeenCalledOnce();
  });

  it('renders bounded start failures', async () => {
    const startWorktreeReview = vi
      .fn<() => Promise<ReviewOperationContract>>()
      .mockRejectedValue(new Error('private source detail'));
    const user = userEvent.setup();
    await renderDashboard({ initialEntry: '/reviews/worktree', startWorktreeReview });
    await user.click(screen.getByRole('button', { name: 'Run worktree review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Gatekeeper could not start the local review.',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('private source detail');
  });
});
