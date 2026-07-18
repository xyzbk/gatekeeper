// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import type { ReviewRunContract, StatusResponse } from '@gatekeeper/contracts';
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
  summary: 'REQUIRE_CHANGES: 1 changed file, 1 deterministic finding.',
  findings: [
    {
      id: 'finding:test:source-needs-tests',
      category: 'test-coverage',
      severity: 'medium',
      authority: 'DETERMINISTIC',
      confidence: 1,
      title: 'Related test change required',
      explanation: 'A related source changed without a test change.',
      evidence: [],
      affectedPaths: ['src/app.ts'],
      remediation: ['Add a matching test change.'],
      falsePositiveRisk: 'low',
      humanApprovalRequired: false,
      policyId: 'source-needs-tests',
      enforcement: 'required',
    },
  ],
  metrics: {
    filesChanged: 1,
    linesAdded: 2,
    linesDeleted: 1,
    productionFilesChanged: 1,
    testFilesChanged: 0,
    documentationFilesChanged: 0,
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

async function renderDashboard(
  loadStatus: () => Promise<StatusResponse>,
  initialEntry = '/',
  reviewWorktree: () => Promise<ReviewRunContract> = () => Promise.resolve(review),
) {
  const { DashboardApp } = await import('./dashboard-app.js');
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <DashboardApp loadStatus={loadStatus} reviewWorktree={reviewWorktree} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('dashboard application shell', () => {
  it('renders an accessible loading state', async () => {
    await renderDashboard(() => new Promise(() => undefined));

    expect(screen.getByRole('status', { name: 'Reading repository status…' })).toBeInTheDocument();
    expect(screen.getByText('Reading repository status…')).toBeInTheDocument();
  });

  it('renders only real repository and environment values', async () => {
    await renderDashboard(() => Promise.resolve(status));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'gatekeeper' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(status.repository.root)).toHaveLength(2);
    expect(screen.getByText(status.repository.head)).toBeInTheDocument();
    expect(screen.getByText(status.repository.remote ?? '')).toBeInTheDocument();
    expect(screen.getByText('git version 2.50.1')).toBeInTheDocument();
    expect(screen.getByText(status.paths.serviceMetadata)).toBeInTheDocument();
  });

  it('renders truthful empty states for detached HEAD, origin, and gh', async () => {
    await renderDashboard(() =>
      Promise.resolve({
        ...status,
        repository: { ...status.repository, branch: null, remote: null },
      }),
    );

    expect(await screen.findAllByText('Detached HEAD')).toHaveLength(2);
    expect(screen.getByText('No origin remote configured')).toBeInTheDocument();
    expect(screen.getByText('Not installed')).toBeInTheDocument();
  });

  it('renders a recoverable error state', async () => {
    const loadStatus = vi
      .fn<() => Promise<StatusResponse>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(status);
    const user = userEvent.setup();
    await renderDashboard(loadStatus);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Gatekeeper could not read local status.',
    );
    await user.click(screen.getByRole('button', { name: 'Retry status request' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'gatekeeper' }),
    ).toBeInTheDocument();
    expect(loadStatus).toHaveBeenCalledTimes(2);
  });

  it('places the skip link and active navigation first in keyboard order', async () => {
    const user = userEvent.setup();
    await renderDashboard(() => Promise.resolve(status));

    await user.tab();
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Repository overview' })).toHaveFocus();
  });

  it('provides a focused not-found route without inventing product data', async () => {
    await renderDashboard(() => Promise.resolve(status), '/unknown');

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return to overview' })).toHaveAttribute('href', '/');
  });
});

describe('worktree Review Inspector', () => {
  it('starts in a ready-to-run state without reviewing on navigation', async () => {
    const reviewWorktree = vi.fn(() => Promise.resolve(review));
    await renderDashboard(() => Promise.resolve(status), '/reviews/worktree', reviewWorktree);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Review current worktree' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run worktree review' })).toBeEnabled();
    expect(reviewWorktree).not.toHaveBeenCalled();
  });

  it('renders a scoped pending state while the review runs', async () => {
    const user = userEvent.setup();
    await renderDashboard(
      () => Promise.resolve(status),
      '/reviews/worktree',
      () => new Promise(() => undefined),
    );

    await user.click(screen.getByRole('button', { name: 'Run worktree review' }));

    expect(
      screen.getByRole('status', { name: 'Reviewing current worktree\u2026' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review in progress' })).toBeDisabled();
  });

  it('renders a safe retryable error state', async () => {
    const reviewWorktree = vi
      .fn<() => Promise<ReviewRunContract>>()
      .mockRejectedValueOnce(new Error('private source detail'))
      .mockResolvedValue(review);
    const user = userEvent.setup();
    await renderDashboard(() => Promise.resolve(status), '/reviews/worktree', reviewWorktree);

    await user.click(screen.getByRole('button', { name: 'Run worktree review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Gatekeeper could not complete the local review.',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('private source detail');

    await user.click(screen.getByRole('button', { name: 'Retry worktree review' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'REQUIRE_CHANGES' })).toBeVisible();
    expect(reviewWorktree).toHaveBeenCalledTimes(2);
  });

  it('renders verdict, authority, metrics, remediation, and bounded changes as text', async () => {
    const user = userEvent.setup();
    await renderDashboard(() => Promise.resolve(status), '/reviews/worktree');

    await user.click(screen.getByRole('button', { name: 'Run worktree review' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'REQUIRE_CHANGES' })).toBeVisible();
    expect(screen.getByText('Authority: DETERMINISTIC')).toBeVisible();
    expect(screen.getByText('Severity: medium')).toBeVisible();
    expect(screen.getByText('Add a matching test change.')).toBeVisible();
    expect(screen.getByRole('cell', { name: 'src/app.ts' })).toBeVisible();
    expect(screen.getByText('1 file')).toBeVisible();
    expect(screen.getAllByText('+2')).toHaveLength(2);
    expect(screen.getAllByText('\u22121')).toHaveLength(2);
  });

  it('explains an empty worktree instead of rendering an empty change table', async () => {
    const user = userEvent.setup();
    await renderDashboard(
      () => Promise.resolve(status),
      '/reviews/worktree',
      () =>
        Promise.resolve({
          ...review,
          verdict: 'FAST_PATH',
          findings: [],
          changes: [],
          metrics: {
            ...review.metrics,
            filesChanged: 0,
            linesAdded: 0,
            linesDeleted: 0,
            productionFilesChanged: 0,
            pathGroups: [],
          },
        }),
    );

    await user.click(screen.getByRole('button', { name: 'Run worktree review' }));

    expect(await screen.findByText('No worktree changes were detected.')).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it.each(['FAST_PATH', 'REQUIRE_CHANGES', 'ESCALATE', 'BLOCK'] as const)(
    'renders the %s verdict as readable text',
    async (verdict) => {
      const user = userEvent.setup();
      await renderDashboard(
        () => Promise.resolve(status),
        '/reviews/worktree',
        () => Promise.resolve({ ...review, verdict }),
      );

      await user.click(screen.getByRole('button', { name: 'Run worktree review' }));

      expect(await screen.findByRole('heading', { level: 1, name: verdict })).toBeVisible();
    },
  );

  it.each(['DETERMINISTIC', 'EVIDENCE_SUPPORTED', 'INFERENCE'] as const)(
    'renders %s authority as readable text',
    async (authority) => {
      const user = userEvent.setup();
      await renderDashboard(
        () => Promise.resolve(status),
        '/reviews/worktree',
        () =>
          Promise.resolve({
            ...review,
            findings: review.findings.map((finding) => ({ ...finding, authority })),
          }),
      );

      await user.click(screen.getByRole('button', { name: 'Run worktree review' }));

      expect(await screen.findByText(`Authority: ${authority}`)).toBeVisible();
    },
  );
});
