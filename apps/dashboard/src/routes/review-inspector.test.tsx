// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import type { ReviewOperationContract, ReviewRunContract } from '@gatekeeper/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { deriveReviewComparison, ReviewInspector } from './review-inspector.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const evidence = {
  sourceType: 'adr' as const,
  repositoryId: 'repository_dashboard_pr',
  sourceId: 'docs/adr/0003-no-required-redis.md',
  title: 'No required Redis',
  path: 'docs/adr/0003-no-required-redis.md',
  excerpt: '<script>alert(1)</script> Keep Redis optional.',
  contentHash: 'a'.repeat(64),
};

function finding(id: string, authority: ReviewRunContract['findings'][number]['authority']) {
  return {
    id,
    category: 'architecture-history',
    severity: 'high' as const,
    authority,
    confidence: 0.95,
    title: `Historical conflict ${id}`,
    explanation: 'The proposed dependency conflicts with active project history.',
    evidence: [evidence],
    affectedPaths: ['src/cache.ts'],
    remediation: ['Keep Redis optional.', 'Add an offline regression test.'],
    humanApprovalRequired: true,
  };
}

function operation(
  verdict: ReviewRunContract['verdict'] = 'ESCALATE',
  authority: ReviewRunContract['findings'][number]['authority'] = 'EVIDENCE_SUPPORTED',
): Extract<ReviewOperationContract, { status: 'completed' }> {
  const previousReview: ReviewRunContract = {
    schemaVersion: 1,
    reviewId: 'review_previous',
    repositoryId: evidence.repositoryId,
    target: { kind: 'pull_request', display: 'Pull request #12', pullRequestNumber: 12 },
    verdict: 'REQUIRE_CHANGES',
    summary: 'Earlier review required changes.',
    findings: [finding('finding_resolved', authority), finding('finding_remaining', authority)],
    metrics: {
      filesChanged: 2,
      linesAdded: 7,
      linesDeleted: 1,
      pathGroups: [
        { name: 'src', count: 1 },
        { name: 'tests', count: 1 },
      ],
    },
    changes: [],
    createdAt: '2026-07-18T18:00:00.000Z',
  };
  const review: ReviewRunContract = {
    ...previousReview,
    reviewId: 'review_current',
    previousReviewId: previousReview.reviewId,
    verdict,
    summary: `${verdict}: review summary.`,
    findings: [finding('finding_remaining', authority)],
    changes: [
      {
        path: 'src/cache.ts',
        status: 'modified',
        additions: 4,
        deletions: 1,
        binary: false,
        contentTruncated: false,
      },
      {
        path: 'tests/cache.test.ts',
        status: 'modified',
        additions: 3,
        deletions: 0,
        binary: false,
        contentTruncated: false,
      },
    ],
    createdAt: '2026-07-18T19:00:00.000Z',
  };
  return {
    schemaVersion: 1,
    reviewId: review.reviewId,
    repositoryId: review.repositoryId,
    target: review.target,
    status: 'completed',
    stage: 'completed',
    review,
    previousReview,
    historySync: {
      schemaVersion: 1,
      repositoryId: review.repositoryId,
      provider: 'github',
      syncedAt: review.createdAt,
      cursor: null,
      partial: true,
      documents: { received: 9, written: 8, unchanged: 0 },
      links: { received: 5, written: 5, unchanged: 0 },
      failures: [{ source: 'review:99', code: 'malformed_record' }],
    },
    evidenceTimeline: [
      {
        role: 'proposal',
        relationship: 'implements',
        sourceAuthority: 'github',
        status: 'historical',
        evidence: {
          ...evidence,
          sourceType: 'issue',
          sourceId: 'issue:#4',
          title: 'Proposal: require Redis',
          path: undefined,
        },
        href: 'https://github.com/xyzbk/gatekeeper/issues/4',
      },
      {
        role: 'implementation',
        relationship: 'supersedes',
        sourceAuthority: 'github',
        status: 'superseded',
        evidence: {
          ...evidence,
          sourceType: 'pull_request',
          sourceId: 'pull_request:#8',
          title: 'Require Redis cache',
          path: undefined,
        },
        href: 'https://github.com/xyzbk/gatekeeper/pull/8',
      },
      {
        role: 'decision',
        relationship: 'supersedes',
        sourceAuthority: 'repository',
        status: 'active',
        evidence,
      },
      {
        role: 'revived_change',
        sourceAuthority: 'github',
        status: 'active',
        evidence: {
          ...evidence,
          sourceType: 'pull_request',
          sourceId: 'pull_request:#12',
          title: 'Revive required Redis',
          path: undefined,
        },
        href: 'https://github.com/xyzbk/gatekeeper/pull/12',
      },
    ],
    createdAt: review.createdAt,
    updatedAt: review.createdAt,
  };
}

function renderInspector(value = operation(), onRereview: (() => void) | undefined = undefined) {
  return render(
    <MemoryRouter>
      <ReviewInspector operation={value} {...(onRereview === undefined ? {} : { onRereview })} />
    </MemoryRouter>,
  );
}

describe('Review Inspector', () => {
  it('renders the review, partial history, ordered timeline, remediation, and comparison', () => {
    const { container } = renderInspector();

    expect(screen.getByRole('heading', { level: 1, name: 'ESCALATE' })).toBeVisible();
    expect(screen.getByText('Authority: EVIDENCE_SUPPORTED')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('History sync was partial');
    const timeline = screen.getByRole('list', { name: 'Evidence timeline' });
    expect(
      within(timeline)
        .getAllByRole('listitem')
        .map((item) => item.getAttribute('data-role')),
    ).toEqual(['proposal', 'implementation', 'decision', 'revived_change']);
    expect(screen.getByRole('link', { name: 'Proposal: require Redis' })).toHaveAttribute(
      'href',
      'https://github.com/xyzbk/gatekeeper/issues/4',
    );
    expect(screen.getByRole('link', { name: 'No required Redis' })).toHaveAttribute(
      'href',
      '/memory?query=docs%2Fadr%2F0003-no-required-redis.md',
    );
    expect(
      screen.getAllByText('<script>alert(1)</script> Keep Redis optional.').length,
    ).toBeGreaterThan(0);
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getAllByText('Keep Redis optional.').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Before / after' })).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Before / after' }).closest('section'),
    ).toHaveTextContent(/REQUIRE_CHANGES\s*→\s*ESCALATE/);
    expect(screen.getByText('finding_resolved')).toBeVisible();
    expect(screen.getByText('finding_remaining')).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Before / after' }).closest('section'),
    ).toHaveTextContent(/1\s+unchanged evidence pointer.*1\s+superseded evidence pointer/);
    expect(screen.getByRole('cell', { name: 'src/cache.ts' })).toBeVisible();
  });

  it.each(['FAST_PATH', 'REQUIRE_CHANGES', 'ESCALATE', 'BLOCK'] as const)(
    'renders the %s verdict as text',
    (verdict) => {
      renderInspector(operation(verdict));
      expect(screen.getByRole('heading', { level: 1, name: verdict })).toBeVisible();
    },
  );

  it.each(['DETERMINISTIC', 'EVIDENCE_SUPPORTED', 'INFERENCE'] as const)(
    'renders %s authority as text',
    (authority) => {
      renderInspector(operation('ESCALATE', authority));
      expect(screen.getByText(`Authority: ${authority}`)).toBeVisible();
    },
  );

  it('copies bounded Codex prompts and announces clipboard failure', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn<(value: string) => Promise<void>>().mockResolvedValueOnce();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderInspector();

    await user.click(screen.getByRole('button', { name: 'Copy evidence prompt' }));
    expect(writeText).toHaveBeenCalledWith(
      'Explain the evidence behind Gatekeeper review review_current for Pull request #12. Do not change files.',
    );
    expect(screen.getByText('Evidence prompt copied.')).toBeVisible();

    writeText.mockRejectedValueOnce(new Error('clipboard unavailable'));
    await user.click(screen.getByRole('button', { name: 'Copy fix prompt' }));
    expect(screen.getByText('Could not copy the fix prompt.')).toBeVisible();
  });

  it('offers a keyboard-native re-review action', async () => {
    const onRereview = vi.fn();
    const user = userEvent.setup();
    renderInspector(operation(), onRereview);

    await user.click(screen.getByRole('button', { name: 'Run re-review' }));
    expect(onRereview).toHaveBeenCalledOnce();
  });

  it('falls back to an internal memory link for an unsafe remote URL', () => {
    const value = operation();
    const first = value.evidenceTimeline[0];
    if (first === undefined) {
      throw new Error('Expected timeline fixture.');
    }
    value.evidenceTimeline[0] = {
      ...first,
      href: 'https://github.com.attacker.example/xyzbk/gatekeeper/issues/4',
    };
    renderInspector(value);

    expect(screen.getByRole('link', { name: 'Proposal: require Redis' })).toHaveAttribute(
      'href',
      '/memory?query=issue%3A%234',
    );
  });
});

describe('review comparison', () => {
  it('derives resolved, remaining, unchanged, and superseded inputs by stable identity', () => {
    const value = operation();
    const comparison = deriveReviewComparison(
      value.review,
      value.previousReview,
      value.evidenceTimeline,
    );

    expect(comparison).toEqual({
      previousVerdict: 'REQUIRE_CHANGES',
      currentVerdict: 'ESCALATE',
      resolvedFindingIds: ['finding_resolved'],
      remainingFindingIds: ['finding_remaining'],
      unchangedEvidenceCount: 1,
      supersededEvidenceCount: 1,
    });
  });
});
