import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';

import type { ReviewClient } from '../api/review-client.js';
import styles from '../styles/dashboard.module.css';

export function ReviewRoute({
  startWorktreeReview,
}: {
  startWorktreeReview: ReviewClient['startWorktreeReview'];
}) {
  const navigate = useNavigate();
  const review = useMutation({
    mutationFn: () => startWorktreeReview(),
    onSuccess: (operation) => navigate(`/reviews/${operation.reviewId}`),
  });
  return (
    <section className={styles.reviewReady}>
      <header className={styles.reviewPageHeader}>
        <p className={styles.contextLabel}>Review Inspector</p>
        <h1>Review current worktree</h1>
        <p>
          Evaluate staged, unstaged, and untracked changes against repository policy. The review is
          local, deterministic, and persisted in Project Memory.
        </p>
      </header>
      <div className={styles.reviewScope}>
        <div>
          <h2>One bounded pass</h2>
          <p>
            Gatekeeper checks change size, required tests, risk zones, import boundaries, and
            protected paths without sending source to a model.
          </p>
        </div>
        <button
          className={styles.primaryButton}
          disabled={review.isPending}
          onClick={() => review.mutate()}
          type="button"
        >
          {review.isPending ? 'Starting review' : 'Run worktree review'}
        </button>
      </div>
      {review.isPending ? (
        <p className={styles.reviewNotice} role="status">
          Creating a durable local review…
        </p>
      ) : null}
      {review.isError ? (
        <div className={styles.pullRequestError} role="alert">
          <p>Gatekeeper could not start the local review.</p>
          <p>Confirm the local service is ready, then retry.</p>
          <button className={styles.secondaryButton} onClick={() => review.mutate()} type="button">
            Retry worktree review
          </button>
        </div>
      ) : null}
    </section>
  );
}
