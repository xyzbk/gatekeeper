import type { ChangedFileSummary } from './change.js';

declare const brand: unique symbol;

export type Brand<T, Name extends string> = T & { readonly [brand]: Name };

export type RepositoryId = Brand<string, 'RepositoryId'>;
export type ReviewId = Brand<string, 'ReviewId'>;
export type FindingId = Brand<string, 'FindingId'>;

export const VERDICTS = ['FAST_PATH', 'REQUIRE_CHANGES', 'ESCALATE', 'BLOCK'] as const;
export const FINDING_AUTHORITIES = ['DETERMINISTIC', 'EVIDENCE_SUPPORTED', 'INFERENCE'] as const;
export const FINDING_SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const;
export const ENFORCEMENT_LEVELS = ['advisory', 'required', 'hard'] as const;
export const REVIEW_TARGET_KINDS = [
  'worktree',
  'staged',
  'branch',
  'commit_range',
  'pull_request',
] as const;
export const EVIDENCE_SOURCE_TYPES = [
  'file',
  'commit',
  'pull_request',
  'issue',
  'comment',
  'adr',
  'documentation',
  'policy',
  'test',
  'decision',
] as const;

export type Verdict = (typeof VERDICTS)[number];
export type FindingAuthority = (typeof FINDING_AUTHORITIES)[number];
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];
export type EnforcementLevel = (typeof ENFORCEMENT_LEVELS)[number];
export type ReviewTargetKind = (typeof REVIEW_TARGET_KINDS)[number];
export type EvidenceSourceType = (typeof EVIDENCE_SOURCE_TYPES)[number];

export interface EvidencePointer {
  sourceType: EvidenceSourceType;
  repositoryId: RepositoryId;
  sourceId: string;
  title?: string;
  path?: string;
  startLine?: number;
  endLine?: number;
  commitSha?: string;
  remoteUrl?: string;
  excerpt?: string;
  contentHash?: string;
}

export interface ReviewTarget {
  kind: ReviewTargetKind;
  display: string;
  base?: string;
  head?: string;
  pullRequestNumber?: number;
}

export interface Finding {
  id: FindingId;
  category: string;
  severity: FindingSeverity;
  authority: FindingAuthority;
  confidence: number;
  title: string;
  explanation: string;
  evidence: EvidencePointer[];
  affectedPaths?: string[];
  affectedSymbols?: string[];
  remediation: string[];
  falsePositiveRisk?: 'none' | 'low' | 'medium' | 'high';
  humanApprovalRequired: boolean;
  policyId?: string | null;
  enforcement?: EnforcementLevel;
}

export interface ReviewMetrics {
  filesChanged: number;
  linesAdded: number;
  linesDeleted: number;
  pathGroups: Array<{ name: string; count: number }>;
  productionFilesChanged?: number;
  testFilesChanged?: number;
  documentationFilesChanged?: number;
}

export interface ReviewDraft {
  schemaVersion: 1;
  reviewId: ReviewId;
  repositoryId: RepositoryId;
  target: ReviewTarget;
  findings: Finding[];
  metrics: ReviewMetrics;
  evidenceCandidates: EvidencePointer[];
  createdAt: string;
}

export interface ReviewRun extends Omit<ReviewDraft, 'evidenceCandidates'> {
  verdict: Verdict;
  summary: string;
  changes: ChangedFileSummary[];
  previousReviewId?: ReviewId;
  reasoningProvider?: string | null;
  model?: string | null;
}

export type VerdictFinding = Pick<
  Finding,
  'authority' | 'enforcement' | 'humanApprovalRequired' | 'id' | 'severity'
>;

export function assembleVerdict(findings: readonly VerdictFinding[]): Verdict {
  if (
    findings.some(
      ({ authority, enforcement }) => authority === 'DETERMINISTIC' && enforcement === 'hard',
    )
  ) {
    return 'BLOCK';
  }

  if (
    findings.some(
      ({ humanApprovalRequired, severity }) =>
        humanApprovalRequired || severity === 'high' || severity === 'critical',
    )
  ) {
    return 'ESCALATE';
  }

  if (findings.some(({ enforcement }) => enforcement === 'required')) {
    return 'REQUIRE_CHANGES';
  }

  return 'FAST_PATH';
}
