import { useState } from 'react';
import type {
  EvidenceTimelineItem,
  ReviewOperationContract,
  ReviewRunContract,
} from '@gatekeeper/contracts';
import { Link } from 'react-router';

import styles from '../styles/dashboard.module.css';

type CompletedOperation = Extract<ReviewOperationContract, { status: 'completed' }>;

interface ReviewComparison {
  previousVerdict: ReviewRunContract['verdict'];
  currentVerdict: ReviewRunContract['verdict'];
  resolvedFindingIds: string[];
  remainingFindingIds: string[];
  unchangedEvidenceCount: number;
  supersededEvidenceCount: number;
}

function evidenceKey(evidence: ReviewRunContract['findings'][number]['evidence'][number]): string {
  return [
    evidence.sourceType,
    evidence.sourceId,
    evidence.path ?? '',
    evidence.commitSha ?? '',
    evidence.contentHash ?? '',
  ].join('\0');
}

export function deriveReviewComparison(
  review: ReviewRunContract,
  previousReview: ReviewRunContract | null,
  timeline: readonly EvidenceTimelineItem[],
): ReviewComparison | null {
  if (previousReview === null) {
    return null;
  }
  const currentIds = new Set(review.findings.map(({ id }) => id));
  const previousEvidence = new Set(
    previousReview.findings.flatMap(({ evidence }) => evidence.map(evidenceKey)),
  );
  const currentEvidence = new Set(
    review.findings.flatMap(({ evidence }) => evidence.map(evidenceKey)),
  );
  const supersededEvidence = new Set(
    timeline
      .filter(({ status }) => status === 'superseded')
      .map(({ evidence }) => evidenceKey(evidence)),
  );
  return {
    previousVerdict: previousReview.verdict,
    currentVerdict: review.verdict,
    resolvedFindingIds: previousReview.findings
      .filter(({ id }) => !currentIds.has(id))
      .map(({ id }) => id),
    remainingFindingIds: previousReview.findings
      .filter(({ id }) => currentIds.has(id))
      .map(({ id }) => id),
    unchangedEvidenceCount: [...previousEvidence].filter((key) => currentEvidence.has(key)).length,
    supersededEvidenceCount: supersededEvidence.size,
  };
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
        <dd>{`−${metrics.linesDeleted}`}</dd>
      </div>
      <div>
        <dt>Path groups</dt>
        <dd>
          {metrics.pathGroups.map(({ count, name }) => `${name} ${count}`).join(' · ') || 'None'}
        </dd>
      </div>
    </dl>
  );
}

function Findings({ review }: { review: ReviewRunContract }) {
  return (
    <section aria-labelledby="review-findings" className={styles.reviewSection}>
      <div className={styles.reviewSectionHeader}>
        <h2 id="review-findings">Findings</h2>
        <span>{review.findings.length}</span>
      </div>
      {review.findings.length === 0 ? (
        <p className={styles.reviewEmpty}>No findings were produced.</p>
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
              {finding.affectedPaths === undefined || finding.affectedPaths.length === 0 ? null : (
                <div className={styles.findingDetail}>
                  <h4>Affected paths</h4>
                  <ul className={styles.pathItems}>
                    {finding.affectedPaths.map((path) => (
                      <li className={styles.mono} key={path} translate="no">
                        {path}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

const roleLabels: Record<EvidenceTimelineItem['role'], string> = {
  proposal: 'Proposal',
  implementation: 'Implementation',
  incident: 'Incident',
  revert: 'Revert',
  decision: 'Decision',
  revived_change: 'Revived change',
  context: 'Context',
};

function safeGitHubUrl(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      url.hostname.toLowerCase() === 'github.com' &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.port.length === 0
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function EvidenceTimeline({ items }: { items: readonly EvidenceTimelineItem[] }) {
  return (
    <section aria-labelledby="evidence-timeline" className={styles.reviewSection}>
      <div className={styles.reviewSectionHeader}>
        <div>
          <h2 id="evidence-timeline">Evidence timeline</h2>
          <p>Ordered project history. Repository and GitHub content remains untrusted evidence.</p>
        </div>
        <span>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className={styles.reviewEmpty}>No linked historical evidence was available.</p>
      ) : (
        <ol aria-label="Evidence timeline" className={styles.timeline}>
          {items.map((item) => {
            const label = item.evidence.title ?? item.evidence.path ?? item.evidence.sourceId;
            const href = safeGitHubUrl(item.href);
            return (
              <li
                className={styles.timelineItem}
                data-role={item.role}
                key={`${item.role}:${evidenceKey(item.evidence)}`}
              >
                <div className={styles.timelineMarker} aria-hidden="true" />
                <article>
                  <div className={styles.timelineHeading}>
                    <p>{roleLabels[item.role]}</p>
                    <div>
                      <span>{item.sourceAuthority}</span>
                      <span>{item.status}</span>
                    </div>
                  </div>
                  <h3>
                    {href === undefined ? (
                      <Link to={`/memory?query=${encodeURIComponent(item.evidence.sourceId)}`}>
                        {label}
                      </Link>
                    ) : (
                      <a href={href} rel="noreferrer noopener" target="_blank">
                        {label}
                      </a>
                    )}
                  </h3>
                  <p className={styles.timelineSource} translate="no">
                    {item.evidence.sourceId}
                  </p>
                  {item.evidence.excerpt === undefined ? null : (
                    <details className={styles.evidenceDetails}>
                      <summary>View bounded excerpt</summary>
                      <p>{item.evidence.excerpt}</p>
                    </details>
                  )}
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function Remediation({ review }: { review: ReviewRunContract }) {
  const items = [...new Set(review.findings.flatMap(({ remediation }) => remediation))];
  return (
    <section aria-labelledby="review-remediation" className={styles.reviewSection}>
      <div className={styles.reviewSectionHeader}>
        <div>
          <h2 id="review-remediation">Remediation</h2>
          <p>Repository-compliant actions derived from the current findings.</p>
        </div>
        <span>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className={styles.reviewEmpty}>No remediation is required for this review.</p>
      ) : (
        <ol className={styles.remediationList}>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      )}
    </section>
  );
}

function PromptActions({ review }: { review: ReviewRunContract }) {
  const [announcement, setAnnouncement] = useState('');
  const prompts = [
    {
      label: 'evidence',
      button: 'Copy evidence prompt',
      value: `Explain the evidence behind Gatekeeper review ${review.reviewId} for ${review.target.display}. Do not change files.`,
    },
    {
      label: 'fix',
      button: 'Copy fix prompt',
      value: `Prepare a repository-compliant fix plan for Gatekeeper review ${review.reviewId} for ${review.target.display}. Use the cited evidence and do not change files until I approve.`,
    },
    {
      label: 're-review',
      button: 'Copy re-review prompt',
      value: `Re-review ${review.target.display} with Gatekeeper and compare it with review ${review.reviewId}.`,
    },
  ] as const;
  const copy = async (label: (typeof prompts)[number]['label'], value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setAnnouncement(
        `${label === 're-review' ? 'Re-review' : `${label[0]?.toUpperCase()}${label.slice(1)}`} prompt copied.`,
      );
    } catch {
      setAnnouncement(`Could not copy the ${label} prompt.`);
    }
  };
  return (
    <section aria-labelledby="codex-prompts" className={styles.promptSection}>
      <div>
        <h2 id="codex-prompts">Continue in Codex</h2>
        <p>Copy a bounded prompt. Gatekeeper does not send or execute it.</p>
      </div>
      <div className={styles.promptActions}>
        {prompts.map((prompt) => (
          <button
            className={styles.secondaryButton}
            key={prompt.label}
            onClick={() => void copy(prompt.label, prompt.value)}
            type="button"
          >
            {prompt.button}
          </button>
        ))}
      </div>
      <p aria-live="polite" className={styles.copyAnnouncement}>
        {announcement}
      </p>
    </section>
  );
}

function Comparison({ comparison }: { comparison: ReviewComparison | null }) {
  if (comparison === null) {
    return null;
  }
  const groups = [
    { label: 'Resolved', ids: comparison.resolvedFindingIds },
    { label: 'Remaining', ids: comparison.remainingFindingIds },
  ];
  return (
    <section aria-labelledby="review-comparison" className={styles.reviewSection}>
      <div className={styles.reviewSectionHeader}>
        <div>
          <h2 id="review-comparison">Before / after</h2>
          <p>Compared by stable finding and evidence identities.</p>
        </div>
      </div>
      <div className={styles.comparisonVerdict}>
        <span>{comparison.previousVerdict}</span>
        <span aria-hidden="true">→</span>
        <strong>{comparison.currentVerdict}</strong>
      </div>
      <div className={styles.comparisonGrid}>
        {groups.map((group) => (
          <div key={group.label}>
            <h3>{group.label}</h3>
            {group.ids.length === 0 ? (
              <p>None</p>
            ) : (
              <ul>
                {group.ids.map((id) => (
                  <li className={styles.mono} key={id} translate="no">
                    {id}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <p className={styles.comparisonEvidence}>
        {comparison.unchangedEvidenceCount}{' '}
        {comparison.unchangedEvidenceCount === 1
          ? 'unchanged evidence pointer'
          : 'unchanged evidence pointers'}
        {' · '}
        {comparison.supersededEvidenceCount}{' '}
        {comparison.supersededEvidenceCount === 1
          ? 'superseded evidence pointer'
          : 'superseded evidence pointers'}
      </p>
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
        <p className={styles.reviewEmpty}>No changes were detected.</p>
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
                  <td className={styles.mono} translate="no">
                    {change.path}
                  </td>
                  <td>{change.status}</td>
                  <td className={styles.mono}>+{change.additions}</td>
                  <td className={styles.mono}>−{change.deletions}</td>
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

export function ReviewInspector({
  onRereview,
  operation,
  rereviewPending = false,
}: {
  onRereview?: () => void;
  operation: CompletedOperation;
  rereviewPending?: boolean;
}) {
  const { evidenceTimeline, historySync, previousReview, review } = operation;
  const comparison = deriveReviewComparison(review, previousReview, evidenceTimeline);
  return (
    <div className={styles.reviewResult}>
      <header className={styles.reviewResultHeader}>
        <div>
          <p className={styles.contextLabel}>Review complete</p>
          <h1 className={verdictClassName(review.verdict)}>{review.verdict}</h1>
          <p className={styles.reviewSummary}>{review.summary}</p>
          <p className={styles.reviewTarget}>{review.target.display}</p>
          <p className={styles.reviewIdentity} translate="no">
            Review ID: {review.reviewId}
          </p>
        </div>
        {onRereview === undefined ? null : (
          <button
            className={styles.primaryButton}
            disabled={rereviewPending}
            onClick={onRereview}
            type="button"
          >
            {rereviewPending ? 'Starting re-review' : 'Run re-review'}
          </button>
        )}
      </header>
      {historySync?.partial === true ? (
        <p className={styles.reviewNotice} role="status">
          History sync was partial: {historySync.failures.length}{' '}
          {historySync.failures.length === 1 ? 'record was' : 'records were'} unavailable. Valid
          evidence remains included.
        </p>
      ) : null}
      <ReviewMetrics review={review} />
      <Findings review={review} />
      <EvidenceTimeline items={evidenceTimeline} />
      <Remediation review={review} />
      <PromptActions review={review} />
      <Comparison comparison={comparison} />
      <ChangeSummary review={review} />
    </div>
  );
}
