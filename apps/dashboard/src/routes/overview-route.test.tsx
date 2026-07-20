// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import type { GitHubSyncResult, IndexResult, RepositoryStatus, StatusResponse } from '@gatekeeper/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OverviewRoute } from './overview-route.js';

afterEach(cleanup);

const status: StatusResponse = {
  schemaVersion: 1,
  service: {
    state: 'ready',
    version: '0.1.0',
    startedAt: '2026-07-20T12:00:00.000Z',
    baseUrl: 'http://127.0.0.1:43127',
  },
  repository: {
    root: 'D:\\work\\gatekeeper',
    branch: 'master',
    head: 'b'.repeat(40),
    dirty: false,
    remote: 'https://github.com/xyzbk/gatekeeper.git',
  },
  tools: { git: { available: true, version: 'git version 2.50.1' }, gh: { available: true, version: '2.0.0' } },
  features: { modelReasoning: 'disabled', projectMemory: 'ready' },
  paths: { appData: 'C:\\Gatekeeper', serviceMetadata: 'C:\\Gatekeeper\\service.json', storage: 'C:\\Gatekeeper\\storage' },
};

const memoryStatus: RepositoryStatus = {
  schemaVersion: 1,
  state: 'ready',
  repository: {
    schemaVersion: 1,
    repositoryId: 'repository_dashboard_control',
    root: status.repository.root,
    remote: status.repository.remote,
    createdAt: '2026-07-20T11:00:00.000Z',
    updatedAt: '2026-07-20T11:00:00.000Z',
  },
  indexState: {
    schemaVersion: 1,
    repositoryId: 'repository_dashboard_control',
    head: 'a'.repeat(40),
    indexedAt: '2026-07-20T11:00:00.000Z',
    files: 3,
    documents: 4,
    commits: 5,
  },
};

const indexResult: IndexResult = {
  schemaVersion: 1,
  repositoryId: 'repository_dashboard_control',
  head: status.repository.head,
  indexedAt: '2026-07-20T12:00:00.000Z',
  files: { scanned: 3, written: 1, unchanged: 2, deleted: 0 },
  documents: { scanned: 4, written: 1, unchanged: 3, deleted: 0 },
  commits: { scanned: 5, written: 2, unchanged: 3, deleted: 0 },
};

const syncResult: GitHubSyncResult = {
  schemaVersion: 1,
  repositoryId: 'repository_dashboard_control',
  provider: 'github',
  syncedAt: '2026-07-20T12:00:00.000Z',
  cursor: null,
  partial: true,
  documents: { received: 4, written: 2, unchanged: 2 },
  links: { received: 6, written: 3, unchanged: 3 },
  failures: [{ source: 'pull_request:#12', code: 'unavailable' }],
};

function renderRoute(options: {
  getMemoryStatus?: () => Promise<RepositoryStatus>;
  indexLocalMemory?: () => Promise<IndexResult>;
  syncGitHubHistory?: () => Promise<GitHubSyncResult>;
} = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <OverviewRoute
        getMemoryStatus={options.getMemoryStatus ?? (() => Promise.resolve(memoryStatus))}
        indexLocalMemory={options.indexLocalMemory ?? (() => Promise.resolve(indexResult))}
        loadStatus={() => Promise.resolve(status)}
        syncGitHubHistory={options.syncGitHubHistory ?? (() => Promise.resolve(syncResult))}
      />
    </QueryClientProvider>,
  );
}

describe('Repository Control', () => {
  it('distinguishes an unavailable memory status from a pending request', async () => {
    renderRoute({ getMemoryStatus: () => Promise.reject(new Error('service stopped')) });

    expect(await screen.findByText('Unavailable — local memory status could not be read.')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Project Memory status is unavailable.',
    );
  });

  it('shows stale memory and starts local indexing only after an explicit click', async () => {
    const indexLocalMemory = vi.fn(() => Promise.resolve(indexResult));
    const user = userEvent.setup();
    renderRoute({ indexLocalMemory });

    expect(await screen.findByRole('heading', { name: 'Repository Control' })).toBeVisible();
    expect(screen.getByText('Stale — local HEAD changed since the last index.')).toBeVisible();
    expect(indexLocalMemory).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Index local memory' }));
    expect(await screen.findByText('Indexed 3 files, 4 documents, and 5 commits.')).toBeVisible();
    expect(indexLocalMemory).toHaveBeenCalledOnce();
  });

  it('explains the bounded read-only GitHub sync and reports partial recovery detail', async () => {
    const syncGitHubHistory = vi.fn(() => Promise.resolve(syncResult));
    const user = userEvent.setup();
    renderRoute({ syncGitHubHistory });

    expect(await screen.findByText(/Reads GitHub via configured gh; stores bounded local evidence; makes no GitHub changes\./)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Sync GitHub history' }));
    expect(await screen.findByText('Sync completed partially. 4 documents received; 6 links received.')).toBeVisible();
    expect(screen.getByText('Some history was unavailable. Retry sync after resolving local gh access.')).toBeVisible();
    expect(syncGitHubHistory).toHaveBeenCalledOnce();
  });
});
