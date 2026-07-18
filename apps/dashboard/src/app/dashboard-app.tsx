import { Link, Route, Routes } from 'react-router';

import type { StatusClient } from '../api/status-client.js';
import type { ReviewClient } from '../api/review-client.js';
import { AppShell } from '../components/app-shell.js';
import { OverviewRoute } from '../routes/overview-route.js';
import { ReviewRoute } from '../routes/review-route.js';
import styles from '../styles/dashboard.module.css';

interface DashboardAppProps {
  loadStatus: StatusClient['getStatus'];
  reviewWorktree: ReviewClient['reviewWorktree'];
}

function NotFoundRoute() {
  return (
    <section className={styles.notFoundState}>
      <p className={styles.contextLabel}>Gatekeeper</p>
      <h1>Page not found</h1>
      <p>This local dashboard route does not exist.</p>
      <Link to="/">Return to overview</Link>
    </section>
  );
}

export function DashboardApp({ loadStatus, reviewWorktree }: DashboardAppProps) {
  return (
    <AppShell>
      <Routes>
        <Route element={<OverviewRoute loadStatus={loadStatus} />} path="/" />
        <Route element={<ReviewRoute reviewWorktree={reviewWorktree} />} path="/reviews/worktree" />
        <Route element={<NotFoundRoute />} path="*" />
      </Routes>
    </AppShell>
  );
}
