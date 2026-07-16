import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { createStatusClient } from './api/status-client.js';
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
const statusClient = createStatusClient();

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <DashboardApp loadStatus={statusClient.getStatus} />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
