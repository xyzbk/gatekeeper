import { Link, Route, Routes } from 'react-router';

import type { MemoryClient } from '../api/memory-client.js';
import type { StatusClient } from '../api/status-client.js';
import type { ReviewClient } from '../api/review-client.js';
import { AppShell } from '../components/app-shell.js';
import { OverviewRoute } from '../routes/overview-route.js';
import { MemoryRoute } from '../routes/memory-route.js';
import { ReviewDetailRoute } from '../routes/review-detail-route.js';
import { PullRequestReviewRoute } from '../routes/pull-request-review-route.js';
import { ReviewRoute } from '../routes/review-route.js';
import styles from '../styles/dashboard.module.css';

interface DashboardAppProps {
  getReview: ReviewClient['getReview'];
  loadStatus: StatusClient['getStatus'];
  startWorktreeReview: ReviewClient['startWorktreeReview'];
  startPullRequestReview: ReviewClient['startPullRequestReview'];
  searchMemory: MemoryClient['search'];
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

export function DashboardApp({
  getReview,
  loadStatus,
  startWorktreeReview,
  startPullRequestReview,
  searchMemory,
}: DashboardAppProps) {
  return (
    <AppShell>
      <Routes>
        <Route element={<OverviewRoute loadStatus={loadStatus} />} path="/" />
        <Route element={<MemoryRoute searchMemory={searchMemory} />} path="/memory" />
        <Route
          element={<ReviewRoute startWorktreeReview={startWorktreeReview} />}
          path="/reviews/worktree"
        />
        <Route
          element={<PullRequestReviewRoute startPullRequestReview={startPullRequestReview} />}
          path="/reviews/pull-request"
        />
        <Route
          element={
            <ReviewDetailRoute
              getReview={getReview}
              startPullRequestReview={startPullRequestReview}
              startWorktreeReview={startWorktreeReview}
            />
          }
          path="/reviews/:reviewId"
        />
        <Route element={<NotFoundRoute />} path="*" />
      </Routes>
    </AppShell>
  );
}
