// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import type { StatusResponse } from '@gatekeeper/contracts';
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

async function renderDashboard(loadStatus: () => Promise<StatusResponse>, initialEntry = '/') {
  const { DashboardApp } = await import('./dashboard-app.js');
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <DashboardApp loadStatus={loadStatus} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('dashboard application shell', () => {
  it('renders an accessible loading state', async () => {
    await renderDashboard(() => new Promise(() => undefined));

    expect(screen.getByRole('status', { name: 'Reading repository status' })).toBeInTheDocument();
    expect(screen.getByText('Reading repository status')).toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: 'Skip to repository overview' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Repository overview' })).toHaveFocus();
  });

  it('provides a focused not-found route without inventing product data', async () => {
    await renderDashboard(() => Promise.resolve(status), '/unknown');

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return to overview' })).toHaveAttribute('href', '/');
  });
});
