import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { createMemoryClient } from './api/memory-client.js';
import { createReviewClient } from './api/review-client.js';
import { createBootstrapLoader, createStatusClient } from './api/status-client.js';
import { DashboardApp } from './app/dashboard-app.js';
import './styles/global.css';

const rootElement = document.querySelector<HTMLElement>('#root');

if (rootElement === null) {
  throw new Error('Gatekeeper dashboard root is missing.');
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 5_000,
    },
  },
});
const loadBootstrap = createBootstrapLoader();
const reviewClient = createReviewClient(globalThis.fetch, loadBootstrap);
const memoryClient = createMemoryClient(globalThis.fetch, loadBootstrap);
const statusClient = createStatusClient(globalThis.fetch, loadBootstrap);

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <DashboardApp
          getReview={reviewClient.getReview}
          loadStatus={statusClient.getStatus}
          startWorktreeReview={reviewClient.startWorktreeReview}
          startPullRequestReview={reviewClient.startPullRequestReview}
          startCommitReview={reviewClient.startCommitReview}
          recentCommits={memoryClient.recentCommits}
          searchMemory={memoryClient.search}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
