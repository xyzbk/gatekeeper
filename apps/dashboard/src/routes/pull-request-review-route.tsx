import type { FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';

import type { ReviewClient } from '../api/review-client.js';
import styles from '../styles/dashboard.module.css';

export function PullRequestReviewRoute({
  startPullRequestReview,
}: {
  startPullRequestReview: ReviewClient['startPullRequestReview'];
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialNumber = searchParams.get('number') ?? '';
  const review = useMutation({
    mutationFn: (pullRequestNumber: number) => startPullRequestReview(pullRequestNumber),
    onSuccess: (operation) => navigate(`/reviews/${operation.reviewId}`),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('pullRequestNumber');
    const pullRequestNumber = typeof value === 'string' ? Number(value) : Number.NaN;
    if (Number.isSafeInteger(pullRequestNumber) && pullRequestNumber > 0) {
      review.mutate(pullRequestNumber);
    }
  };

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
            defaultValue={initialNumber}
            id="pull-request-number"
            inputMode="numeric"
            min={1}
            name="pullRequestNumber"
            required
            step={1}
            type="number"
          />
          <button className={styles.primaryButton} disabled={review.isPending} type="submit">
            {review.isPending ? 'Starting review' : 'Review pull request'}
          </button>
        </div>
      </form>
      {review.isPending ? (
        <p className={styles.reviewNotice} role="status">
          Creating a durable review and opening its progress route…
        </p>
      ) : null}
      {review.isError ? (
        <div className={styles.pullRequestError} role="alert">
          <p>Gatekeeper could not start the pull-request review.</p>
          <p>Confirm `gh` is installed and authenticated for the fixed repository, then retry.</p>
          <button
            className={styles.secondaryButton}
            disabled={review.variables === undefined}
            onClick={() => {
              if (review.variables !== undefined) {
                review.mutate(review.variables);
              }
            }}
            type="button"
          >
            Retry pull-request review
          </button>
        </div>
      ) : null}
    </section>
  );
}
