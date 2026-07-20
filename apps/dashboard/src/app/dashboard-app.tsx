import { useState } from 'react';
import { Link, Route, Routes } from 'react-router';

import type { MemoryClient } from '../api/memory-client.js';
import type { StatusClient } from '../api/status-client.js';
import type { ReviewClient } from '../api/review-client.js';
import { AppShell } from '../components/app-shell.js';
import { OverviewRoute, type RepositoryControlAction } from '../routes/overview-route.js';
import { CommitExplorerRoute } from '../routes/commit-explorer-route.js';
import { MemoryRoute } from '../routes/memory-route.js';
import { ReviewDetailRoute } from '../routes/review-detail-route.js';
import { PullRequestReviewRoute } from '../routes/pull-request-review-route.js';
import { PullRequestExplorerRoute } from '../routes/pull-request-explorer-route.js';
import { ReviewRoute } from '../routes/review-route.js';
import styles from '../styles/dashboard.module.css';

interface DashboardAppProps {
  getReview: ReviewClient['getReview'];
  loadStatus: StatusClient['getStatus'];
  startWorktreeReview: ReviewClient['startWorktreeReview'];
  startPullRequestReview: ReviewClient['startPullRequestReview'];
  startCommitReview: ReviewClient['startCommitReview'];
  exploreCommits: MemoryClient['exploreCommits'];
  explorePullRequests: MemoryClient['explorePullRequests'];
  getMemoryStatus: MemoryClient['getMemoryStatus'];
  indexLocalMemory: MemoryClient['indexLocalMemory'];
  recentCommits: MemoryClient['recentCommits'];
  searchMemory: MemoryClient['search'];
  syncGitHubHistory: MemoryClient['syncGitHubHistory'];
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
  startCommitReview,
  exploreCommits,
  explorePullRequests,
  getMemoryStatus,
  indexLocalMemory,
  recentCommits,
  searchMemory,
  syncGitHubHistory,
}: DashboardAppProps) {
  const [lastRepositoryControlAction, setLastRepositoryControlAction] =
    useState<RepositoryControlAction | null>(null);

  return (
    <AppShell>
      <Routes>
        <Route
          element={
            <OverviewRoute
              getMemoryStatus={getMemoryStatus}
              indexLocalMemory={indexLocalMemory}
              loadStatus={loadStatus}
              syncGitHubHistory={syncGitHubHistory}
              lastAction={lastRepositoryControlAction}
              onActionResult={setLastRepositoryControlAction}
            />
          }
          path="/"
        />
        <Route
          element={
            <CommitExplorerRoute
              exploreCommits={exploreCommits}
              startCommitReview={startCommitReview}
            />
          }
          path="/commits"
        />
        <Route
          element={
            <MemoryRoute
              recentCommits={recentCommits}
              searchMemory={searchMemory}
              startCommitReview={startCommitReview}
            />
          }
          path="/memory"
        />
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
            <PullRequestExplorerRoute
              explorePullRequests={explorePullRequests}
              startPullRequestReview={startPullRequestReview}
            />
          }
          path="/pull-requests"
        />
        <Route
          element={
            <ReviewDetailRoute
              getReview={getReview}
              startCommitReview={startCommitReview}
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
