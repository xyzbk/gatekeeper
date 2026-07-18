import type { FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router';

import type { ReviewClient } from '../api/review-client.js';
import styles from '../styles/dashboard.module.css';
import { ReviewResult } from './review-route.js';

export function PullRequestReviewRoute({
  reviewPullRequest,
}: {
  reviewPullRequest: ReviewClient['reviewPullRequest'];
}) {
  const reviewMutation = useMutation({
    mutationFn: (pullRequestNumber: number) => reviewPullRequest(pullRequestNumber),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('pullRequestNumber');
    const pullRequestNumber = typeof value === 'string' ? Number(value) : Number.NaN;
    if (!Number.isSafeInteger(pullRequestNumber) || pullRequestNumber <= 0) {
      return;
    }
    reviewMutation.mutate(pullRequestNumber);
  };

  if (reviewMutation.isSuccess) {
    return (
      <ReviewResult
        action={
          <div className={styles.reviewActions}>
            <Link
              className={styles.secondaryButton}
              to={`/reviews/${reviewMutation.data.review.reviewId}`}
            >
              Open stored review
            </Link>
            <button
              className={styles.secondaryButton}
              onClick={() => reviewMutation.mutate(reviewMutation.variables)}
              type="button"
            >
              Run again
            </button>
          </div>
        }
        context="Pull request review complete"
        review={reviewMutation.data.review}
        {...(reviewMutation.data.sync.partial
          ? {
              status: `History sync was partial: ${reviewMutation.data.sync.failures.length} remote record could not be normalized. Valid history remains available.`,
            }
          : {})}
      />
    );
  }

  return (
    <section className={styles.reviewReady}>
      <header className={styles.reviewPageHeader}>
        <p className={styles.contextLabel}>Review Inspector</p>
        <h1>Review a GitHub pull request</h1>
        <p>
          Synchronize bounded read-only GitHub history, then evaluate one pull request against the
          same repository policy used for worktree review.
        </p>
      </header>
      <form className={styles.pullRequestForm} onSubmit={submit}>
        <label htmlFor="pull-request-number">Pull request number</label>
        <div>
          <input
            autoComplete="off"
            id="pull-request-number"
            inputMode="numeric"
            min={1}
            name="pullRequestNumber"
            required
            step={1}
            type="number"
          />
          <button
            className={styles.primaryButton}
            disabled={reviewMutation.isPending}
            type="submit"
          >
            {reviewMutation.isPending ? 'Review in progress' : 'Sync & review pull request'}
          </button>
        </div>
      </form>
      {reviewMutation.isPending ? (
        <div aria-label="Reviewing pull request…" className={styles.reviewProgress} role="status">
          <div className={`${styles.skeleton} ${styles.reviewSkeletonTitle}`} />
          <div className={`${styles.skeleton} ${styles.reviewSkeletonLine}`} />
          <div className={`${styles.skeleton} ${styles.reviewSkeletonPanel}`} />
          <span>Synchronizing bounded history and reviewing the pull request…</span>
        </div>
      ) : null}
      {reviewMutation.isError ? (
        <div className={styles.pullRequestError} role="alert">
          <p>Gatekeeper could not complete the pull-request review.</p>
          <p>Confirm `gh` is installed and authenticated for the fixed repository, then retry.</p>
          <button
            className={styles.primaryButton}
            onClick={() => reviewMutation.mutate(reviewMutation.variables)}
            type="button"
          >
            Retry pull-request review
          </button>
        </div>
      ) : null}
    </section>
  );
}
