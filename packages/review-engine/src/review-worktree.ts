import { createHash } from 'node:crypto';
import { posix } from 'node:path';

import type { GatekeeperPolicy } from '@gatekeeper/config';
import type { ChangedFile, ChangeSet } from '@gatekeeper/contracts';
import {
  assembleVerdict,
  type ChangedFileSummary,
  type EnforcementLevel,
  type EvidencePointer,
  type Finding,
  type FindingId,
  type FindingSeverity,
  type RepositoryId,
  type ReviewId,
  type ReviewMetrics,
  type ReviewRun,
} from '@gatekeeper/domain';
import ignore, { type Ignore } from 'ignore';

const TEST_PATHS = ['test/**', 'tests/**', '**/__tests__/**', '**/*.test.*', '**/*.spec.*'];
const DOCUMENTATION_PATHS = ['docs/**', '**/*.md', '**/*.mdx'];

export interface ReviewWorktreeInput {
  changeSet: ChangeSet;
  createdAt: string;
  policy: GatekeeperPolicy;
  repositoryId: RepositoryId;
  reviewId: ReviewId;
}

function createMatcher(patterns: readonly string[]): Ignore {
  return ignore().add(patterns);
}

function matches(matcher: Ignore, path: string): boolean {
  return matcher.ignores(path);
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function pathEvidence(repositoryId: RepositoryId, paths: readonly string[]): EvidencePointer[] {
  return paths.map((path) => ({
    sourceType: 'file',
    repositoryId,
    sourceId: path,
    path,
  }));
}

function findingId(value: string): FindingId {
  return `finding:${value}` as FindingId;
}

function enforcementSeverity(enforcement: EnforcementLevel): FindingSeverity {
  return enforcement === 'hard' ? 'high' : enforcement === 'required' ? 'medium' : 'low';
}

function changeSizeFindings(
  files: readonly ChangedFile[],
  policy: GatekeeperPolicy,
  repositoryId: RepositoryId,
): Finding[] {
  const findings: Finding[] = [];
  const totalLines = files.reduce(
    (total, { additions, deletions }) => total + additions + deletions,
    0,
  );
  const maxFiles = policy.review?.maxChangedFiles;
  const maxLines = policy.review?.maxChangedLines;

  if (maxFiles !== undefined && files.length > maxFiles.value) {
    findings.push({
      id: findingId('max-changed-files'),
      category: 'change-size',
      severity: enforcementSeverity(maxFiles.enforcement),
      authority: 'DETERMINISTIC',
      confidence: 1,
      title: 'Changed-file limit exceeded',
      explanation: `The worktree changes ${files.length} files; policy allows ${maxFiles.value}.`,
      evidence: pathEvidence(
        repositoryId,
        files.map(({ path }) => path),
      ),
      affectedPaths: files.map(({ path }) => path),
      remediation: ['Split the work into a smaller review or obtain the required approval.'],
      falsePositiveRisk: 'none',
      humanApprovalRequired: false,
      policyId: 'review.maxChangedFiles',
      enforcement: maxFiles.enforcement,
    });
  }

  if (maxLines !== undefined && totalLines > maxLines.value) {
    findings.push({
      id: findingId('max-changed-lines'),
      category: 'change-size',
      severity: enforcementSeverity(maxLines.enforcement),
      authority: 'DETERMINISTIC',
      confidence: 1,
      title: 'Changed-line limit exceeded',
      explanation: `The worktree changes ${totalLines} lines; policy allows ${maxLines.value}.`,
      evidence: pathEvidence(
        repositoryId,
        files.map(({ path }) => path),
      ),
      affectedPaths: files.map(({ path }) => path),
      remediation: ['Split the work into a smaller review or obtain the required approval.'],
      falsePositiveRisk: 'none',
      humanApprovalRequired: false,
      policyId: 'review.maxChangedLines',
      enforcement: maxLines.enforcement,
    });
  }

  return findings;
}

function testRelationshipFindings(
  files: readonly ChangedFile[],
  policy: GatekeeperPolicy,
  repositoryId: RepositoryId,
): Finding[] {
  return (policy.tests?.relationships ?? []).flatMap((relationship) => {
    const sourceMatcher = createMatcher(relationship.source);
    const testMatcher = createMatcher(relationship.tests);
    const sources = files.filter(({ path }) => matches(sourceMatcher, path));
    const hasTest = files.some(({ path }) => matches(testMatcher, path));
    if (sources.length === 0 || hasTest) {
      return [];
    }

    const paths = sources.map(({ path }) => path);
    return [
      {
        id: findingId(`test:${relationship.id}`),
        category: 'test-coverage',
        severity: enforcementSeverity(relationship.enforcement),
        authority: 'DETERMINISTIC',
        confidence: 1,
        title: 'Related test change required',
        explanation: `Changed source matches policy relationship "${relationship.id}" without a matching test change.`,
        evidence: pathEvidence(repositoryId, paths),
        affectedPaths: paths,
        remediation: [`Change a test matching: ${relationship.tests.join(', ')}.`],
        falsePositiveRisk: 'low',
        humanApprovalRequired: false,
        policyId: relationship.id,
        enforcement: relationship.enforcement,
      } satisfies Finding,
    ];
  });
}

function riskZoneFindings(
  files: readonly ChangedFile[],
  policy: GatekeeperPolicy,
  repositoryId: RepositoryId,
): Finding[] {
  return (policy.riskZones ?? []).flatMap((zone) => {
    const matcher = createMatcher(zone.paths);
    const paths = files.filter(({ path }) => matches(matcher, path)).map(({ path }) => path);
    if (paths.length === 0) {
      return [];
    }

    const enforcement = zone.verdictFloor === 'REQUIRE_CHANGES' ? 'required' : 'advisory';
    const humanApprovalRequired =
      zone.verdictFloor === 'ESCALATE' || zone.level === 'high' || zone.level === 'critical';
    return [
      {
        id: findingId(`risk:${zone.id}`),
        category: 'risk-zone',
        severity: zone.level,
        authority: 'DETERMINISTIC',
        confidence: 1,
        title: 'Risk-zone change detected',
        explanation: `Changed paths enter the "${zone.id}" risk zone.`,
        evidence: pathEvidence(repositoryId, paths),
        affectedPaths: paths,
        remediation: ['Review the risk-zone requirements and obtain approval when required.'],
        falsePositiveRisk: 'none',
        humanApprovalRequired,
        policyId: zone.id,
        enforcement,
      } satisfies Finding,
    ];
  });
}

function relativeImportSpecifiers(lines: readonly string[]): string[] {
  const specifiers = new Set<string>();
  const patterns = [
    /\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"](\.[^'"]*)['"]/g,
    /\bimport\s*\(\s*['"](\.[^'"]*)['"]/g,
  ];

  for (const line of lines) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      for (const match of line.matchAll(pattern)) {
        const specifier = match[1];
        if (specifier !== undefined) {
          specifiers.add(specifier);
        }
      }
    }
  }

  return [...specifiers];
}

function resolveImportPath(sourcePath: string, specifier: string): string | undefined {
  const cleanSpecifier = specifier.split(/[?#]/, 1)[0];
  if (cleanSpecifier === undefined) {
    return undefined;
  }
  const target = posix.normalize(posix.join(posix.dirname(sourcePath), cleanSpecifier));
  return target === '..' || target.startsWith('../') || posix.isAbsolute(target)
    ? undefined
    : target;
}

function importBoundaryFindings(
  files: readonly ChangedFile[],
  policy: GatekeeperPolicy,
  repositoryId: RepositoryId,
): Finding[] {
  return (policy.architecture?.importBoundaries ?? []).flatMap((boundary) => {
    const sourceMatcher = createMatcher(boundary.from);
    const deniedMatcher = createMatcher(boundary.deny);
    const violations = new Set<string>();
    const sources = new Set<string>();

    for (const file of files) {
      if (!file.binary && matches(sourceMatcher, file.path)) {
        for (const specifier of relativeImportSpecifiers(file.addedLines)) {
          const target = resolveImportPath(file.path, specifier);
          if (target !== undefined && matches(deniedMatcher, target)) {
            sources.add(file.path);
            violations.add(target);
          }
        }
      }
    }

    const paths = [...uniqueSorted(sources), ...uniqueSorted(violations)];
    if (paths.length === 0) {
      return [];
    }

    return [
      {
        id: findingId(`import-boundary:${boundary.id}`),
        category: 'architecture',
        severity: enforcementSeverity(boundary.enforcement),
        authority: 'DETERMINISTIC',
        confidence: 1,
        title: 'Import boundary violated',
        explanation:
          boundary.rationale ?? `An added relative import violates boundary "${boundary.id}".`,
        evidence: pathEvidence(repositoryId, paths),
        affectedPaths: paths,
        remediation: ['Route the dependency through an allowed module boundary.'],
        falsePositiveRisk: 'low',
        humanApprovalRequired: false,
        policyId: boundary.id,
        enforcement: boundary.enforcement,
      } satisfies Finding,
    ];
  });
}

function protectedPathFindings(
  files: readonly ChangedFile[],
  policy: GatekeeperPolicy,
  repositoryId: RepositoryId,
): Finding[] {
  return (policy.protectedPaths ?? []).flatMap((protectedPath) => {
    const matcher = createMatcher(protectedPath.paths);
    const paths = files.filter(({ path }) => matches(matcher, path)).map(({ path }) => path);
    if (paths.length === 0) {
      return [];
    }

    return [
      {
        id: findingId(`protected-path:${protectedPath.id}`),
        category: 'protected-path',
        severity: enforcementSeverity(protectedPath.enforcement),
        authority: 'DETERMINISTIC',
        confidence: 1,
        title: 'Protected path changed',
        explanation: protectedPath.message,
        evidence: pathEvidence(repositoryId, paths),
        affectedPaths: paths,
        remediation: ['Revert the protected-path change or use its authorized workflow.'],
        falsePositiveRisk: 'none',
        humanApprovalRequired: protectedPath.enforcement === 'hard',
        policyId: protectedPath.id,
        enforcement: protectedPath.enforcement,
      } satisfies Finding,
    ];
  });
}

function classifyMetrics(files: readonly ChangedFile[]): ReviewMetrics {
  const testMatcher = createMatcher(TEST_PATHS);
  const documentationMatcher = createMatcher(DOCUMENTATION_PATHS);
  const pathCounts = new Map<string, number>();
  let productionFilesChanged = 0;
  let testFilesChanged = 0;
  let documentationFilesChanged = 0;

  for (const file of files) {
    const group = file.path.includes('/') ? (file.path.split('/', 1)[0] ?? '(root)') : '(root)';
    pathCounts.set(group, (pathCounts.get(group) ?? 0) + 1);
    if (matches(testMatcher, file.path)) {
      testFilesChanged += 1;
    } else if (matches(documentationMatcher, file.path)) {
      documentationFilesChanged += 1;
    } else {
      productionFilesChanged += 1;
    }
  }

  return {
    filesChanged: files.length,
    linesAdded: files.reduce((total, { additions }) => total + additions, 0),
    linesDeleted: files.reduce((total, { deletions }) => total + deletions, 0),
    productionFilesChanged,
    testFilesChanged,
    documentationFilesChanged,
    pathGroups: [...pathCounts]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, count]) => ({ name, count })),
  };
}

function summarize(verdict: ReviewRun['verdict'], files: number, findings: number): string {
  const fileLabel = files === 1 ? 'file' : 'files';
  const findingLabel = findings === 1 ? 'finding' : 'findings';
  return `${verdict}: ${files} changed ${fileLabel}, ${findings} deterministic ${findingLabel}.`;
}

function summarizeChange(file: ChangedFile): ChangedFileSummary {
  const summary = {
    path: file.path,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    binary: file.binary,
    contentTruncated: file.contentTruncated,
  };

  return file.previousPath === undefined
    ? summary
    : { ...summary, previousPath: file.previousPath };
}

export function reviewWorktree(input: ReviewWorktreeInput): ReviewRun {
  const ignoreMatcher = createMatcher(input.policy.paths?.ignore ?? []);
  const files = input.changeSet.files
    .filter(({ path }) => !matches(ignoreMatcher, path))
    .sort((left, right) => left.path.localeCompare(right.path));
  const findings = [
    ...changeSizeFindings(files, input.policy, input.repositoryId),
    ...testRelationshipFindings(files, input.policy, input.repositoryId),
    ...riskZoneFindings(files, input.policy, input.repositoryId),
    ...importBoundaryFindings(files, input.policy, input.repositoryId),
    ...protectedPathFindings(files, input.policy, input.repositoryId),
  ].sort((left, right) => left.id.localeCompare(right.id));
  const verdict = assembleVerdict(findings);

  return {
    schemaVersion: 1,
    reviewId: input.reviewId,
    repositoryId: input.repositoryId,
    target: input.changeSet.target,
    verdict,
    summary: summarize(verdict, files.length, findings.length),
    findings,
    metrics: classifyMetrics(files),
    changes: files.map(summarizeChange),
    createdAt: input.createdAt,
  };
}

export function createLocalRepositoryId(canonicalRoot: string): RepositoryId {
  const digest = createHash('sha256').update(canonicalRoot).digest('hex').slice(0, 24);
  return `repository_${digest}` as RepositoryId;
}
