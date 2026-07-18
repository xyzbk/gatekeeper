import type {
  MemorySearchInput,
  MemorySearchResult,
  ReviewCompletionFinding,
} from '@gatekeeper/contracts';
import {
  assembleVerdict,
  type EvidencePointer,
  type Finding,
  type FindingId,
  type ReviewDraft,
  type ReviewRun,
} from '@gatekeeper/domain';

const MAX_QUERIES = 8;
const RESULTS_PER_QUERY = 5;
const MAX_EVIDENCE_CANDIDATES = 20;
const PROMPT_INJECTION_PATTERN =
  /\b(?:ignore|disregard|override)\b.{0,80}\b(?:instruction|prompt|rule)s?\b|\b(?:system|developer)\s+(?:message|prompt)\b|\b(?:reveal|publish|expose)\b.{0,80}\b(?:secret|token|credential)s?\b|\byou are\s+(?:chatgpt|codex)\b/iu;

export interface PrepareReviewDraftInput {
  review: ReviewRun;
  searchMemory: (input: MemorySearchInput) => Promise<MemorySearchResult[]>;
}

export interface CompleteReviewInput {
  review: ReviewRun;
  draft: ReviewDraft;
  findings: readonly ReviewCompletionFinding[];
  model?: string | null;
}

export class InvalidReviewCompletionError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'InvalidReviewCompletionError';
  }
}

function evidenceKey(evidence: EvidencePointer): string {
  return JSON.stringify(
    Object.entries(evidence).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function memoryQueries(review: ReviewRun): string[] {
  const queries = new Set<string>();

  for (const { path } of review.changes) {
    queries.add(path);
    const stem = path
      .split('/')
      .at(-1)
      ?.replace(/\.[^.]+$/u, '');
    if (stem !== undefined && stem.length >= 3) {
      queries.add(stem);
    }
    for (const token of path.split(/[^a-zA-Z0-9]+/u)) {
      if (token.length >= 4) {
        queries.add(token);
      }
    }
  }

  return [...queries].slice(0, MAX_QUERIES);
}

function promptInjectionFinding(
  repositoryId: ReviewRun['repositoryId'],
  evidenceCandidates: readonly EvidencePointer[],
): Finding | undefined {
  const suspicious = evidenceCandidates.filter((candidate) =>
    PROMPT_INJECTION_PATTERN.test(
      [candidate.title, candidate.path, candidate.excerpt].filter(Boolean).join('\n'),
    ),
  );
  if (suspicious.length === 0) {
    return undefined;
  }

  return {
    id: 'finding:content-security:prompt-injection' as FindingId,
    category: 'content-security',
    severity: 'high',
    authority: 'DETERMINISTIC',
    confidence: 1,
    title: 'Prompt-injection pattern detected in repository evidence',
    explanation:
      'Retrieved repository content contains instruction-like text. Gatekeeper treats it only as untrusted evidence and does not execute or follow it.',
    evidence: [...suspicious],
    remediation: [
      'Review the cited content as data and remove deceptive instructions if inappropriate.',
    ],
    falsePositiveRisk: 'low',
    humanApprovalRequired: true,
    policyId: 'content-security.prompt-injection',
    enforcement: 'advisory',
  };
}

export async function prepareReviewDraft({
  review,
  searchMemory,
}: PrepareReviewDraftInput): Promise<ReviewDraft> {
  const evidenceByKey = new Map<string, EvidencePointer>();

  for (const query of memoryQueries(review)) {
    const results = await searchMemory({
      schemaVersion: 1,
      repositoryId: review.repositoryId,
      query,
      limit: RESULTS_PER_QUERY,
    });
    for (const { evidence } of results) {
      if (evidence.repositoryId === review.repositoryId) {
        evidenceByKey.set(evidenceKey(evidence as EvidencePointer), evidence as EvidencePointer);
      }
      if (evidenceByKey.size >= MAX_EVIDENCE_CANDIDATES) {
        break;
      }
    }
    if (evidenceByKey.size >= MAX_EVIDENCE_CANDIDATES) {
      break;
    }
  }

  const evidenceCandidates = [...evidenceByKey.values()];
  const deterministicFindings = review.findings.filter(
    ({ authority }) => authority === 'DETERMINISTIC',
  );
  const injectionFinding = promptInjectionFinding(review.repositoryId, evidenceCandidates);

  return {
    schemaVersion: 1,
    reviewId: review.reviewId,
    repositoryId: review.repositoryId,
    target: review.target,
    findings:
      injectionFinding === undefined
        ? deterministicFindings
        : [...deterministicFindings, injectionFinding],
    metrics: review.metrics,
    changes: review.changes,
    ...(review.previousReviewId === undefined ? {} : { previousReviewId: review.previousReviewId }),
    evidenceCandidates,
    createdAt: review.createdAt,
  };
}

function validateAuthoredFindings(
  review: ReviewRun,
  draft: ReviewDraft,
  findings: readonly ReviewCompletionFinding[],
): void {
  const offeredEvidence = new Set([
    ...draft.evidenceCandidates.map(evidenceKey),
    ...draft.findings.flatMap(({ evidence }) => evidence.map(evidenceKey)),
  ]);
  const deterministicIds = new Set(draft.findings.map(({ id }) => id));
  const changedPaths = new Set(review.changes.map(({ path }) => path));
  const seen = new Set<string>();

  for (const finding of findings) {
    if (seen.has(finding.id)) {
      throw new InvalidReviewCompletionError(`Duplicate finding ID: ${finding.id}`);
    }
    seen.add(finding.id);
    if (deterministicIds.has(finding.id as FindingId)) {
      throw new InvalidReviewCompletionError(
        `Finding ID collides with a deterministic finding: ${finding.id}`,
      );
    }
    for (const evidence of finding.evidence) {
      if (evidence.repositoryId !== review.repositoryId) {
        throw new InvalidReviewCompletionError(
          `Evidence repository does not match review repository: ${finding.id}`,
        );
      }
      if (!offeredEvidence.has(evidenceKey(evidence as EvidencePointer))) {
        throw new InvalidReviewCompletionError(
          `Finding cites evidence that is not an offered evidence candidate: ${finding.id}`,
        );
      }
    }
    for (const path of finding.affectedPaths ?? []) {
      if (!changedPaths.has(path)) {
        throw new InvalidReviewCompletionError(
          `Finding cites a path that is not a changed path: ${path}`,
        );
      }
    }
  }
}

function summarize(review: ReviewRun, findings: readonly Finding[], verdict: ReviewRun['verdict']) {
  const authorities = {
    deterministic: findings.filter(({ authority }) => authority === 'DETERMINISTIC').length,
    evidenceSupported: findings.filter(({ authority }) => authority === 'EVIDENCE_SUPPORTED')
      .length,
    inference: findings.filter(({ authority }) => authority === 'INFERENCE').length,
  };
  const fileLabel = review.changes.length === 1 ? 'file' : 'files';

  return `${verdict}: ${review.changes.length} changed ${fileLabel}; ${authorities.deterministic} deterministic, ${authorities.evidenceSupported} evidence-supported, ${authorities.inference} inference findings.`;
}

export function completeReview({
  review,
  draft,
  findings: authoredFindings,
  model,
}: CompleteReviewInput): ReviewRun {
  if (draft.reviewId !== review.reviewId || draft.repositoryId !== review.repositoryId) {
    throw new InvalidReviewCompletionError(
      'Review draft identity does not match the stored review.',
    );
  }
  validateAuthoredFindings(review, draft, authoredFindings);
  const findings = [...draft.findings, ...(authoredFindings as Finding[])];
  const verdict = assembleVerdict(findings);

  return {
    schemaVersion: 1,
    reviewId: review.reviewId,
    repositoryId: review.repositoryId,
    target: review.target,
    findings,
    metrics: review.metrics,
    changes: review.changes,
    ...(review.previousReviewId === undefined ? {} : { previousReviewId: review.previousReviewId }),
    verdict,
    summary: summarize(review, findings, verdict),
    reasoningProvider: 'codex',
    ...(model === undefined ? {} : { model }),
    createdAt: review.createdAt,
  };
}
