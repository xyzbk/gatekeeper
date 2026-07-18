import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';

import { ReviewClientError, type ReviewClient } from '../api/review-client.js';
import styles from '../styles/dashboard.module.css';
import { ReviewResult } from './review-route.js';

function StoredReviewLoading() {
  return (
    <section className={styles.storedReviewState}>
      <p className={styles.contextLabel}>Stored review</p>
      <div
        aria-label="Loading stored review…"
        className={styles.storedReviewProgress}
        role="status"
      >
        <div className={`${styles.skeleton} ${styles.reviewSkeletonTitle}`} />
        <div className={`${styles.skeleton} ${styles.reviewSkeletonLine}`} />
        <div className={`${styles.skeleton} ${styles.reviewSkeletonPanel}`} />
        <span>Loading stored review…</span>
      </div>
    </section>
  );
}

function StoredReviewNotFound() {
  return (
    <section className={styles.notFoundState}>
      <p className={styles.contextLabel}>Stored review</p>
      <h1>Review not found</h1>
      <p>No persisted review matches this local route.</p>
      <Link to="/reviews/worktree">Open worktree review</Link>
    </section>
  );
}

export function ReviewDetailRoute({ getReview }: { getReview: ReviewClient['getReview'] }) {
  const { reviewId } = useParams<{ reviewId: string }>();
  const reviewQuery = useQuery({
    enabled: reviewId !== undefined,
    queryFn: ({ signal }) => getReview(reviewId ?? '', signal),
    queryKey: ['stored-review', reviewId],
    retry: false,
  });

  if (reviewId === undefined) {
    return <StoredReviewNotFound />;
  }
  if (reviewQuery.isPending) {
    return <StoredReviewLoading />;
  }
  if (reviewQuery.isError) {
    if (reviewQuery.error instanceof ReviewClientError && reviewQuery.error.code === 'NOT_FOUND') {
      return <StoredReviewNotFound />;
    }
    return (
      <section className={styles.storedReviewState}>
        <p className={styles.contextLabel}>Stored review</p>
        <h1>Review could not be loaded</h1>
        <div role="alert">
          <p>Stored review could not be loaded.</p>
          <p>Confirm the local service is ready, then retry.</p>
        </div>
        <button
          className={styles.primaryButton}
          onClick={() => void reviewQuery.refetch()}
          type="button"
        >
          Retry stored review
        </button>
      </section>
    );
  }

  return (
    <ReviewResult
      action={
        <Link className={styles.secondaryButton} to="/reviews/worktree">
          Open worktree review
        </Link>
      }
      context="Stored review"
      review={reviewQuery.data}
    />
  );
}
