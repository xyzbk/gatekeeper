import type { FormEvent } from 'react';
import { useState } from 'react';
import type { PullRequestExplorerInput, PullRequestExplorerPullRequest } from '@gatekeeper/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';

import type { MemoryClient } from '../api/memory-client.js';
import type { ReviewClient } from '../api/review-client.js';
import styles from '../styles/dashboard.module.css';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

interface ExplorerFormState {
  query: string;
  reviewState: 'all' | 'reviewed' | 'not_reviewed';
  sort: 'newest' | 'oldest';
  state: 'all' | 'open' | 'closed';
  updatedAfter: string;
  updatedBefore: string;
}

const initialFormState: ExplorerFormState = {
  query: '',
  reviewState: 'all',
  sort: 'newest',
  state: 'all',
  updatedAfter: '',
  updatedBefore: '',
};

function inputFor(
  form: ExplorerFormState,
  cursor: number | undefined,
): Omit<PullRequestExplorerInput, 'repositoryId'> {
  const query = form.query.trim();
  const updatedAfter = form.updatedAfter.trim();
  const updatedBefore = form.updatedBefore.trim();
  return {
    schemaVersion: 1,
    state: form.state,
    reviewState: form.reviewState,
    sort: form.sort,
    ...(query.length === 0 ? {} : { query }),
    ...(updatedAfter.length === 0 ? {} : { updatedAfter }),
    ...(updatedBefore.length === 0 ? {} : { updatedBefore }),
    ...(cursor === undefined ? {} : { cursor }),
  };
}

function PullRequestRow({
  pullRequest,
  reviewPending,
  onReview,
}: {
  pullRequest: PullRequestExplorerPullRequest;
  reviewPending: boolean;
  onReview: (number: number) => void;
}) {
  const evidenceQuery = encodeURIComponent(`pull_request:#${pullRequest.number}`);
  return (
    <article className={styles.pullRequestRow}>
      <div className={styles.pullRequestRowMain}>
        <div className={styles.pullRequestRowMeta}>
          <span className={styles.mono}>#{pullRequest.number}</span>
          <span>{pullRequest.state}</span>
          <span>{pullRequest.reviewed ? 'Reviewed' : 'Not reviewed'}</span>
        </div>
        <h2>{pullRequest.title}</h2>
        <p>
          <time dateTime={pullRequest.updatedAt}>
            Updated {dateFormatter.format(new Date(pullRequest.updatedAt))}
          </time>
          <span>Untrusted repository content</span>
        </p>
      </div>
      <div className={styles.pullRequestRowActions}>
        <Link className={styles.secondaryButton} to={`/memory?query=${evidenceQuery}`}>
          View evidence
        </Link>
        <button
          className={styles.primaryButton}
          disabled={reviewPending}
          onClick={() => onReview(pullRequest.number)}
          type="button"
        >
          Review pull request #{pullRequest.number}
        </button>
      </div>
    </article>
  );
}

export function PullRequestExplorerRoute({
  explorePullRequests,
  startPullRequestReview,
}: {
  explorePullRequests: MemoryClient['explorePullRequests'];
  startPullRequestReview: ReviewClient['startPullRequestReview'];
}) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(initialFormState);
  const [applied, setApplied] = useState(initialFormState);
  const [cursors, setCursors] = useState<number[]>([]);
  const cursor = cursors.at(-1);
  const pullRequestsQuery = useQuery({
    queryFn: ({ signal }) => explorePullRequests(inputFor(applied, cursor), signal),
    queryKey: ['pull-request-explorer', applied, cursor],
    retry: false,
  });
  const review = useMutation({
    mutationFn: (number: number) => startPullRequestReview(number),
    onSuccess: (operation) => navigate(`/reviews/${operation.reviewId}`),
  });
  const hasActiveFilters =
    applied.query.length > 0 ||
    applied.state !== 'all' ||
    applied.reviewState !== 'all' ||
    applied.updatedAfter.length > 0 ||
    applied.updatedBefore.length > 0;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setApplied(draft);
    setCursors([]);
  };

  return (
    <section className={styles.pullRequestExplorerPage}>
      <header className={styles.commitExplorerHeader}>
        <p className={styles.contextLabel}>Repository evidence</p>
        <h1>Browse pull requests</h1>
        <p>
          Browse already-synced pull-request metadata, inspect its stored evidence, then choose
          whether to start a durable review. Titles are untrusted repository content.
        </p>
      </header>
      <form className={styles.commitFilters} onSubmit={submit}>
        <div className={styles.pullRequestFilterGrid}>
          <label>
            <span>Search pull requests</span>
            <input
              aria-label="Search pull requests"
              autoComplete="off"
              maxLength={256}
              onChange={(event) => setDraft((current) => ({ ...current, query: event.target.value }))}
              placeholder="Title or number"
              type="search"
              value={draft.query}
            />
          </label>
          <label>
            <span>Pull request state</span>
            <select
              aria-label="Pull request state"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  state: event.target.value as ExplorerFormState['state'],
                }))
              }
              value={draft.state}
            >
              <option value="all">Any state</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          <label>
            <span>Updated from</span>
            <input
              onChange={(event) =>
                setDraft((current) => ({ ...current, updatedAfter: event.target.value }))
              }
              type="date"
              value={draft.updatedAfter}
            />
          </label>
          <label>
            <span>Updated to</span>
            <input
              onChange={(event) =>
                setDraft((current) => ({ ...current, updatedBefore: event.target.value }))
              }
              type="date"
              value={draft.updatedBefore}
            />
          </label>
          <label>
            <span>Review state</span>
            <select
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  reviewState: event.target.value as ExplorerFormState['reviewState'],
                }))
              }
              value={draft.reviewState}
            >
              <option value="all">Any state</option>
              <option value="reviewed">Reviewed</option>
              <option value="not_reviewed">Not reviewed</option>
            </select>
          </label>
          <label>
            <span>Order</span>
            <select
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  sort: event.target.value as ExplorerFormState['sort'],
                }))
              }
              value={draft.sort}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
          <button className={styles.primaryButton} disabled={pullRequestsQuery.isFetching} type="submit">
            {pullRequestsQuery.isFetching ? 'Loading…' : 'Apply filters'}
          </button>
        </div>
      </form>
      {pullRequestsQuery.isFetching ? (
        <p className={styles.reviewNotice} role="status">
          Loading stored pull-request evidence…
        </p>
      ) : null}
      {pullRequestsQuery.isError ? (
        <div className={styles.commitExplorerError} role="alert">
          <p>Stored pull-request evidence could not be loaded.</p>
          <p>Confirm the local Gatekeeper service is ready, then retry.</p>
          <button
            className={styles.secondaryButton}
            onClick={() => void pullRequestsQuery.refetch()}
            type="button"
          >
            Retry pull requests
          </button>
        </div>
      ) : null}
      {pullRequestsQuery.isSuccess ? (
        <>
          {pullRequestsQuery.data.pullRequests.length === 0 ? (
            <section className={styles.commitExplorerEmpty}>
              <h2>{hasActiveFilters ? 'No pull requests match these filters.' : 'No pull requests are stored yet.'}</h2>
              <p>Sync GitHub history from Overview, then return to browse its bounded evidence.</p>
            </section>
          ) : (
            <div aria-label="Stored pull requests" className={styles.pullRequestList}>
              {pullRequestsQuery.data.pullRequests.map((pullRequest) => (
                <PullRequestRow
                  key={pullRequest.number}
                  onReview={(number) => review.mutate(number)}
                  pullRequest={pullRequest}
                  reviewPending={review.isPending}
                />
              ))}
            </div>
          )}
          <nav aria-label="Pull request pages" className={styles.commitPagination}>
            <button
              className={styles.secondaryButton}
              disabled={cursors.length === 0 || pullRequestsQuery.isFetching}
              onClick={() => setCursors((current) => current.slice(0, -1))}
              type="button"
            >
              Previous page
            </button>
            <span>Page {cursors.length + 1}</span>
            <button
              className={styles.secondaryButton}
              disabled={pullRequestsQuery.data.nextCursor === null || pullRequestsQuery.isFetching}
              onClick={() => {
                const nextCursor = pullRequestsQuery.data.nextCursor;
                if (nextCursor !== null) {
                  setCursors((current) => [...current, nextCursor]);
                }
              }}
              type="button"
            >
              Next page
            </button>
          </nav>
        </>
      ) : null}
      {review.isError ? (
        <p className={styles.commitExplorerError} role="alert">
          Gatekeeper could not start the pull-request review.
        </p>
      ) : null}
      <p className={styles.pullRequestKnownLink}>
        Know the number already? <Link to="/reviews/pull-request">Review a pull request directly</Link>.
      </p>
    </section>
  );
}
