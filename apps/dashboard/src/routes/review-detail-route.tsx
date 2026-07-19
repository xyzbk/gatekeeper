import type { ReviewLookupContract, ReviewOperationContract } from '@gatekeeper/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';

import { ReviewClientError, type ReviewClient } from '../api/review-client.js';
import styles from '../styles/dashboard.module.css';
import { ReviewInspector } from './review-inspector.js';

const stageLabels: Record<
  Extract<ReviewOperationContract, { status: 'queued' | 'running' }>['stage'],
  string
> = {
  queued: 'Queued for local review',
  syncing_history: 'Synchronizing project history',
  evaluating_change: 'Evaluating the change',
  persisting_review: 'Persisting the review',
};

function isOperation(value: ReviewLookupContract): value is ReviewOperationContract {
  return 'status' in value;
}

function StoredReviewLoading() {
  return (
    <section className={styles.storedReviewState}>
      <p className={styles.contextLabel}>Review Inspector</p>
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
      <p className={styles.contextLabel}>Review Inspector</p>
      <h1>Review not found</h1>
      <p>No persisted review matches this local route.</p>
      <Link to="/reviews/worktree">Open worktree review</Link>
    </section>
  );
}

function ReviewProgress({
  operation,
}: {
  operation: Extract<ReviewOperationContract, { status: 'queued' | 'running' }>;
}) {
  const stages = ['syncing_history', 'evaluating_change', 'persisting_review'] as const;
  const activeIndex = operation.status === 'queued' ? -1 : stages.indexOf(operation.stage);
  return (
    <section className={styles.reviewPending}>
      <header className={styles.reviewPageHeader}>
        <p className={styles.contextLabel}>Review Inspector</p>
        <h1>{operation.target.display}</h1>
        <p>
          Gatekeeper is running the real local review pipeline. This route can be reopened safely.
        </p>
      </header>
      <div aria-label="Review progress" className={styles.operationProgress} role="status">
        <p>{stageLabels[operation.stage]}</p>
        <ol>
          {stages.map((stage, index) => (
            <li
              aria-current={index === activeIndex ? 'step' : undefined}
              data-state={
                index < activeIndex ? 'complete' : index === activeIndex ? 'active' : 'waiting'
              }
              key={stage}
            >
              <span aria-hidden="true" />
              {stageLabels[stage]}
            </li>
          ))}
        </ol>
        <span className={styles.reviewIdentity} translate="no">
          Review ID: {operation.reviewId}
        </span>
      </div>
    </section>
  );
}

function FailedReview({
  operation,
}: {
  operation: Extract<ReviewOperationContract, { status: 'failed' }>;
}) {
  const retryPath =
    operation.target.kind === 'pull_request'
      ? '/reviews/pull-request'
      : operation.target.kind === 'commit_range'
        ? '/memory'
        : '/reviews/worktree';
  return (
    <section className={styles.reviewError}>
      <p className={styles.contextLabel}>Review Inspector</p>
      <h1>Review did not complete</h1>
      <div role="alert">
        <p>{operation.error.message}</p>
        {operation.error.repair === undefined ? null : <p>{operation.error.repair}</p>}
      </div>
      <Link className={styles.primaryButton} to={retryPath}>
        Start another review
      </Link>
    </section>
  );
}

function completedOperation(
  value: ReviewLookupContract,
): Extract<ReviewOperationContract, { status: 'completed' }> | undefined {
  if (isOperation(value)) {
    return value.status === 'completed' ? value : undefined;
  }
  return {
    schemaVersion: 1,
    reviewId: value.reviewId,
    repositoryId: value.repositoryId,
    target: value.target,
    status: 'completed',
    stage: 'completed',
    review: value,
    previousReview: null,
    historySync: null,
    evidenceTimeline: [],
    createdAt: value.createdAt,
    updatedAt: value.createdAt,
  };
}

export function ReviewDetailRoute({
  getReview,
  startPullRequestReview,
  startCommitReview,
  startWorktreeReview,
}: {
  getReview: ReviewClient['getReview'];
  startCommitReview: ReviewClient['startCommitReview'];
  startPullRequestReview: ReviewClient['startPullRequestReview'];
  startWorktreeReview: ReviewClient['startWorktreeReview'];
}) {
  const { reviewId } = useParams<{ reviewId: string }>();
  const navigate = useNavigate();
  const reviewQuery = useQuery({
    enabled: reviewId !== undefined,
    queryFn: ({ signal }) => getReview(reviewId ?? '', signal),
    queryKey: ['stored-review', reviewId],
    refetchInterval: (query) => {
      const value = query.state.data;
      return value !== undefined &&
        isOperation(value) &&
        (value.status === 'queued' || value.status === 'running')
        ? 150
        : false;
    },
    retry: false,
  });
  const rereview = useMutation({
    mutationFn: async (operation: Extract<ReviewOperationContract, { status: 'completed' }>) => {
      if (
        operation.target.kind === 'pull_request' &&
        operation.target.pullRequestNumber !== undefined
      ) {
        return startPullRequestReview(operation.target.pullRequestNumber);
      }
      if (operation.target.kind === 'worktree') {
        return startWorktreeReview();
      }
      if (operation.target.kind === 'commit_range' && operation.target.head !== undefined) {
        return startCommitReview(operation.target.head);
      }
      throw new Error('This review target cannot be restarted from the dashboard.');
    },
    onSuccess: (operation) => navigate(`/reviews/${operation.reviewId}`),
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
        <p className={styles.contextLabel}>Review Inspector</p>
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
  if (isOperation(reviewQuery.data)) {
    if (reviewQuery.data.status === 'queued' || reviewQuery.data.status === 'running') {
      return <ReviewProgress operation={reviewQuery.data} />;
    }
    if (reviewQuery.data.status === 'failed') {
      return <FailedReview operation={reviewQuery.data} />;
    }
  }
  const operation = completedOperation(reviewQuery.data);
  if (operation === undefined) {
    return <StoredReviewLoading />;
  }
  return (
    <>
      {rereview.isError ? (
        <p className={styles.reviewNotice} role="alert">
          Gatekeeper could not start the re-review. Confirm the local service is ready, then retry.
        </p>
      ) : null}
      <ReviewInspector
        onRereview={() => rereview.mutate(operation)}
        operation={operation}
        rereviewPending={rereview.isPending}
      />
    </>
  );
}
