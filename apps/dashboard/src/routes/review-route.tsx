import type { ReactNode } from 'react';
import type { ReviewRunContract } from '@gatekeeper/contracts';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router';

import type { ReviewClient } from '../api/review-client.js';
import styles from '../styles/dashboard.module.css';

function ReviewButton({
  children,
  disabled = false,
  onClick,
  secondary = false,
}: {
  children: string;
  disabled?: boolean;
  onClick: () => void;
  secondary?: boolean;
}) {
  return (
    <button
      className={secondary ? styles.secondaryButton : styles.primaryButton}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function ReadyState({ run }: { run: () => void }) {
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
        <ReviewButton onClick={run}>Run worktree review</ReviewButton>
      </div>
    </section>
  );
}

function PendingState() {
  return (
    <section className={styles.reviewPending}>
      <header className={styles.reviewPageHeader}>
        <p className={styles.contextLabel}>Review Inspector</p>
        <h1>Review current worktree</h1>
      </header>
      <div
        aria-label={'Reviewing current worktree\u2026'}
        className={styles.reviewProgress}
        role="status"
      >
        <div className={`${styles.skeleton} ${styles.reviewSkeletonTitle}`} />
        <div className={`${styles.skeleton} ${styles.reviewSkeletonLine}`} />
        <div className={`${styles.skeleton} ${styles.reviewSkeletonPanel}`} />
        <span>{'Reviewing current worktree\u2026'}</span>
      </div>
      <ReviewButton disabled onClick={() => undefined}>
        Review in progress
      </ReviewButton>
    </section>
  );
}

function ReviewErrorState({ retry }: { retry: () => void }) {
  return (
    <section className={styles.reviewError}>
      <p className={styles.contextLabel}>Review Inspector</p>
      <h1>Review did not complete</h1>
      <div role="alert">
        <p>Gatekeeper could not complete the local review.</p>
        <p>Confirm the repository is accessible and the policy is valid, then retry.</p>
      </div>
      <ReviewButton onClick={retry}>Retry worktree review</ReviewButton>
    </section>
  );
}

function ReviewMetrics({ review }: { review: ReviewRunContract }) {
  const { metrics } = review;
  return (
    <dl aria-label="Review metrics" className={styles.reviewMetrics}>
      <div>
        <dt>Files</dt>
        <dd>{`${metrics.filesChanged} ${metrics.filesChanged === 1 ? 'file' : 'files'}`}</dd>
      </div>
      <div>
        <dt>Added</dt>
        <dd>{`+${metrics.linesAdded}`}</dd>
      </div>
      <div>
        <dt>Removed</dt>
        <dd>{`\u2212${metrics.linesDeleted}`}</dd>
      </div>
      <div>
        <dt>Path groups</dt>
        <dd>
          {metrics.pathGroups.map(({ count, name }) => `${name} ${count}`).join(' \u00b7 ') ||
            'None'}
        </dd>
      </div>
    </dl>
  );
}

function FindingList({ review }: { review: ReviewRunContract }) {
  return (
    <section aria-labelledby="review-findings" className={styles.reviewSection}>
      <div className={styles.reviewSectionHeader}>
        <h2 id="review-findings">Deterministic findings</h2>
        <span>{review.findings.length}</span>
      </div>
      {review.findings.length === 0 ? (
        <p className={styles.reviewEmpty}>No deterministic policy findings were produced.</p>
      ) : (
        <div className={styles.findingList}>
          {review.findings.map((finding) => (
            <article className={styles.finding} key={finding.id}>
              <div className={styles.findingHeading}>
                <div>
                  <h3>{finding.title}</h3>
                  <p>{finding.explanation}</p>
                </div>
                <div className={styles.findingLabels}>
                  <span>Authority: {finding.authority}</span>
                  <span>Severity: {finding.severity}</span>
                </div>
              </div>
              {finding.affectedPaths !== undefined && finding.affectedPaths.length > 0 ? (
                <div className={styles.findingDetail}>
                  <h4>Affected paths</h4>
                  <ul className={styles.pathItems}>
                    {finding.affectedPaths.map((path) => (
                      <li className={styles.mono} key={path}>
                        {path}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className={styles.findingDetail}>
                <h4>Remediation</h4>
                <ul>
                  {finding.remediation.map((remediation) => (
                    <li key={remediation}>{remediation}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ChangeSummary({ review }: { review: ReviewRunContract }) {
  return (
    <section aria-labelledby="change-summary" className={styles.reviewSection}>
      <div className={styles.reviewSectionHeader}>
        <div>
          <h2 id="change-summary">Bounded change summary</h2>
          <p>Counts and paths only. Source and raw diff content are not returned.</p>
        </div>
      </div>
      {review.changes.length === 0 ? (
        <p className={styles.reviewEmpty}>No worktree changes were detected.</p>
      ) : (
        <div className={styles.changeTableScroll}>
          <table className={styles.changeTable}>
            <thead>
              <tr>
                <th scope="col">Path</th>
                <th scope="col">Status</th>
                <th scope="col">Added</th>
                <th scope="col">Removed</th>
                <th scope="col">Inspection</th>
              </tr>
            </thead>
            <tbody>
              {review.changes.map((change) => (
                <tr key={change.path}>
                  <td className={styles.mono}>{change.path}</td>
                  <td>{change.status}</td>
                  <td className={styles.mono}>+{change.additions}</td>
                  <td className={styles.mono}>{`\u2212${change.deletions}`}</td>
                  <td>
                    {change.contentTruncated ? 'Bounded' : change.binary ? 'Binary' : 'Complete'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function verdictClassName(verdict: ReviewRunContract['verdict']) {
  switch (verdict) {
    case 'FAST_PATH':
      return styles.verdictFast;
    case 'REQUIRE_CHANGES':
      return styles.verdictChanges;
    case 'ESCALATE':
      return styles.verdictEscalate;
    case 'BLOCK':
      return styles.verdictBlock;
  }
}

export function ReviewResult({
  action,
  context = 'Review complete',
  review,
}: {
  action?: ReactNode;
  context?: string;
  review: ReviewRunContract;
}) {
  return (
    <div aria-live="polite" className={styles.reviewResult}>
      <header className={styles.reviewResultHeader}>
        <div>
          <p className={styles.contextLabel}>{context}</p>
          <h1 className={verdictClassName(review.verdict)}>{review.verdict}</h1>
          <p className={styles.reviewSummary}>{review.summary}</p>
          <p className={styles.reviewIdentity}>Review ID: {review.reviewId}</p>
        </div>
        {action}
      </header>
      <ReviewMetrics review={review} />
      <FindingList review={review} />
      <ChangeSummary review={review} />
    </div>
  );
}

export function ReviewRoute({
  reviewWorktree,
}: {
  reviewWorktree: ReviewClient['reviewWorktree'];
}) {
  const reviewMutation = useMutation({ mutationFn: () => reviewWorktree() });

  if (reviewMutation.isPending) {
    return <PendingState />;
  }
  if (reviewMutation.isError) {
    return <ReviewErrorState retry={() => reviewMutation.mutate()} />;
  }
  if (reviewMutation.isSuccess) {
    return (
      <ReviewResult
        action={
          <div className={styles.reviewActions}>
            <Link
              className={styles.secondaryButton}
              to={`/reviews/${reviewMutation.data.reviewId}`}
            >
              Open stored review
            </Link>
            <ReviewButton onClick={() => reviewMutation.mutate()} secondary>
              Run again
            </ReviewButton>
          </div>
        }
        review={reviewMutation.data}
      />
    );
  }
  return <ReadyState run={() => reviewMutation.mutate()} />;
}
