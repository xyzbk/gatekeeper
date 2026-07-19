import type { FormEvent } from 'react';
import { useState } from 'react';
import type { CommitExplorerCommit, CommitExplorerInput } from '@gatekeeper/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';

import { CommitExplorerClientError, type MemoryClient } from '../api/memory-client.js';
import type { ReviewClient } from '../api/review-client.js';
import styles from '../styles/dashboard.module.css';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

interface ExplorerFormState {
  authoredAfter: string;
  authoredBefore: string;
  branch: string;
  query: string;
  reviewState: 'all' | 'reviewed' | 'not_reviewed';
  sort: 'newest' | 'oldest';
  source: 'all_local' | 'project_memory';
}

const initialFormState: ExplorerFormState = {
  authoredAfter: '',
  authoredBefore: '',
  branch: '',
  query: '',
  reviewState: 'all',
  sort: 'newest',
  source: 'all_local',
};

function inputFor(form: ExplorerFormState, cursor: number | undefined): CommitExplorerInput {
  const branch = form.branch.trim();
  const query = form.query.trim();
  const authoredAfter = form.authoredAfter.trim();
  const authoredBefore = form.authoredBefore.trim();
  return {
    schemaVersion: 1,
    source: form.source,
    reviewState: form.reviewState,
    sort: form.sort,
    ...(branch.length === 0 ? {} : { branch }),
    ...(query.length === 0 ? {} : { query }),
    ...(authoredAfter.length === 0 ? {} : { authoredAfter }),
    ...(authoredBefore.length === 0 ? {} : { authoredBefore }),
    ...(cursor === undefined ? {} : { cursor }),
  };
}

function CommitCard({
  commit,
  disabled,
  onReview,
}: {
  commit: CommitExplorerCommit;
  disabled: boolean;
  onReview: (sha: string) => void;
}) {
  return (
    <button
      aria-label={`Review ${commit.title}`}
      className={styles.commitCard}
      disabled={disabled}
      onClick={() => onReview(commit.sha)}
      type="button"
    >
      <span className={styles.commitCardHeader}>
        <span>Local commit</span>
        <span className={styles.mono}>{commit.sha.slice(0, 12)}</span>
      </span>
      <span className={styles.commitCardTitle}>{commit.title}</span>
      <span className={styles.commitCardFooter}>
        <time dateTime={commit.authoredAt}>
          {dateFormatter.format(new Date(commit.authoredAt))}
        </time>
        <span>
          {commit.reviewed ? 'Reviewed' : commit.indexed ? 'In Project Memory' : 'Local only'}
        </span>
      </span>
    </button>
  );
}

function LoadingCards() {
  return (
    <div aria-label="Loading local commits" className={styles.commitGrid} role="status">
      {Array.from({ length: 12 }, (_, index) => (
        <div className={styles.commitSkeleton} key={index}>
          <span className={`${styles.skeleton} ${styles.commitSkeletonMeta}`} />
          <span className={`${styles.skeleton} ${styles.commitSkeletonTitle}`} />
          <span className={`${styles.skeleton} ${styles.commitSkeletonFooter}`} />
        </div>
      ))}
    </div>
  );
}

export function CommitExplorerRoute({
  exploreCommits,
  startCommitReview,
}: {
  exploreCommits: MemoryClient['exploreCommits'];
  startCommitReview: ReviewClient['startCommitReview'];
}) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(initialFormState);
  const [applied, setApplied] = useState(initialFormState);
  const [cursors, setCursors] = useState<number[]>([]);
  const cursor = cursors.at(-1);
  const commitsQuery = useQuery({
    queryFn: ({ signal }) => exploreCommits(inputFor(applied, cursor), signal),
    queryKey: ['commit-explorer', applied, cursor],
    retry: false,
  });
  const reviewCommit = useMutation({
    mutationFn: (sha: string) => startCommitReview(sha),
    onSuccess: (operation) => navigate(`/reviews/${operation.reviewId}`),
  });
  const resolvedBranch = draft.branch || commitsQuery.data?.selection.branch || '';
  const selectedBranches =
    commitsQuery.data?.branches ?? (resolvedBranch.length === 0 ? [] : [resolvedBranch]);
  const isStaleBranch =
    commitsQuery.error instanceof CommitExplorerClientError &&
    commitsQuery.error.code === 'BRANCH_UNAVAILABLE';

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = { ...draft, branch: resolvedBranch };
    setDraft(next);
    setApplied(next);
    setCursors([]);
  };
  const refreshBranches = () => {
    const next = { ...draft, branch: '' };
    setDraft(next);
    setApplied({ ...applied, branch: '' });
    setCursors([]);
  };
  const hasActiveFilters =
    applied.query.length > 0 ||
    applied.authoredAfter.length > 0 ||
    applied.authoredBefore.length > 0 ||
    applied.reviewState !== 'all';

  return (
    <section className={styles.commitExplorerPage}>
      <header className={styles.commitExplorerHeader}>
        <p className={styles.contextLabel}>Repository history</p>
        <h1>Browse local commits</h1>
        <p>
          Inspect local branch history, then start the same durable commit review used across
          Gatekeeper. Commit titles are untrusted repository content.
        </p>
      </header>
      <form className={styles.commitFilters} onSubmit={submit}>
        <fieldset className={styles.commitSourceFieldset}>
          <legend>Source</legend>
          <div className={styles.commitSourceToggle}>
            <label>
              <input
                checked={draft.source === 'all_local'}
                name="commit-source"
                onChange={() => setDraft((current) => ({ ...current, source: 'all_local' }))}
                type="radio"
                value="all_local"
              />
              <span>All local commits</span>
            </label>
            <label>
              <input
                checked={draft.source === 'project_memory'}
                name="commit-source"
                onChange={() => setDraft((current) => ({ ...current, source: 'project_memory' }))}
                type="radio"
                value="project_memory"
              />
              <span>Project Memory</span>
            </label>
          </div>
        </fieldset>
        <div className={styles.commitFilterGrid}>
          <label>
            <span>Branch</span>
            <select
              aria-label="Branch"
              disabled={selectedBranches.length === 0}
              onChange={(event) =>
                setDraft((current) => ({ ...current, branch: event.target.value }))
              }
              value={resolvedBranch}
            >
              {selectedBranches.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Search commits</span>
            <input
              aria-label="Search commits"
              autoComplete="off"
              maxLength={256}
              onChange={(event) =>
                setDraft((current) => ({ ...current, query: event.target.value }))
              }
              placeholder="Title or full SHA"
              type="search"
              value={draft.query}
            />
          </label>
          <label>
            <span>Commit date from</span>
            <input
              onChange={(event) =>
                setDraft((current) => ({ ...current, authoredAfter: event.target.value }))
              }
              type="date"
              value={draft.authoredAfter}
            />
          </label>
          <label>
            <span>Commit date to</span>
            <input
              onChange={(event) =>
                setDraft((current) => ({ ...current, authoredBefore: event.target.value }))
              }
              type="date"
              value={draft.authoredBefore}
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
          <button className={styles.primaryButton} disabled={commitsQuery.isFetching} type="submit">
            {commitsQuery.isFetching ? 'Loading…' : 'Apply filters'}
          </button>
        </div>
      </form>
      {commitsQuery.isFetching ? <LoadingCards /> : null}
      {commitsQuery.isError ? (
        <div className={styles.commitExplorerError} role="alert">
          <p>
            {isStaleBranch
              ? 'The selected local branch is no longer available.'
              : 'Local commits could not be loaded.'}
          </p>
          <p>
            {isStaleBranch
              ? 'Refresh branch choices and continue with the current local repository.'
              : 'Confirm the local Gatekeeper service is ready, then retry.'}
          </p>
          <button
            className={styles.secondaryButton}
            onClick={isStaleBranch ? refreshBranches : () => void commitsQuery.refetch()}
            type="button"
          >
            {isStaleBranch ? 'Refresh branches' : 'Retry local commits'}
          </button>
        </div>
      ) : null}
      {commitsQuery.isSuccess ? (
        <>
          {commitsQuery.data.commits.length === 0 ? (
            <section className={styles.commitExplorerEmpty}>
              <h2>
                {applied.source === 'project_memory'
                  ? 'No Project Memory commits on this branch.'
                  : hasActiveFilters
                    ? 'No commits match these filters.'
                    : 'No local commits on this branch.'}
              </h2>
              <p>Adjust the selected branch or filters, then try again.</p>
            </section>
          ) : (
            <div aria-label="Local commit cards" className={styles.commitGrid}>
              {commitsQuery.data.commits.map((commit) => (
                <CommitCard
                  commit={commit}
                  disabled={reviewCommit.isPending}
                  key={commit.sha}
                  onReview={(commitSha) => reviewCommit.mutate(commitSha)}
                />
              ))}
            </div>
          )}
          <nav aria-label="Commit pages" className={styles.commitPagination}>
            <button
              className={styles.secondaryButton}
              disabled={cursors.length === 0 || commitsQuery.isFetching}
              onClick={() => setCursors((current) => current.slice(0, -1))}
              type="button"
            >
              Previous page
            </button>
            <span>Page {cursors.length + 1}</span>
            <button
              className={styles.secondaryButton}
              disabled={commitsQuery.data.nextCursor === null || commitsQuery.isFetching}
              onClick={() => {
                const nextCursor = commitsQuery.data.nextCursor;
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
      {reviewCommit.isError ? (
        <p className={styles.commitExplorerError} role="alert">
          Gatekeeper could not start the historical review.
        </p>
      ) : null}
    </section>
  );
}
