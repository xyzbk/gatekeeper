import { writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { ChangedFile, ChangeSet, ReviewRunContract } from '../packages/contracts/src/index.js';
import type { RepositoryId, ReviewId } from '../packages/domain/src/index.js';
import { createGitHubProvider, normalizeGitHubRemote } from '../packages/github-gh/src/index.js';
import { reviewPullRequest, reviewWorktree } from '../packages/review-engine/src/index.js';

import { createGhostChangeRunner, loadGhostChangeFixture } from './ghost-change-fixture.js';
import { runJudgeDemoSmoke, type JudgeDemoOptions } from './judge-demo.js';

type GoldenScenario =
  | 'clean-bug-fix'
  | 'missing-test'
  | 'protected-path'
  | 'auth-escalation'
  | 'redis-revival'
  | 'prompt-injection';

export interface GoldenOutcome {
  scenario: GoldenScenario;
  verdict: ReviewRunContract['verdict'];
  findingIds: string[];
  evidenceIds: string[];
}

export interface GoldenEvaluation {
  externalNetworkCalls: 0;
  modelCalls: 0;
  outcomes: GoldenOutcome[];
}

function changedFile(path: string): ChangedFile {
  return {
    path,
    status: 'modified',
    additions: 1,
    deletions: 0,
    binary: false,
    contentTruncated: false,
    addedLines: ['export const changed = true;'],
  };
}

function worktreeChangeSet(files: ChangedFile[]): ChangeSet {
  return {
    schemaVersion: 1,
    target: { kind: 'worktree', display: 'Current worktree' },
    files,
  };
}

function toOutcome(scenario: GoldenScenario, review: ReviewRunContract): GoldenOutcome {
  return {
    scenario,
    verdict: review.verdict,
    findingIds: review.findings.map(({ id }) => id),
    evidenceIds: [
      ...new Set(
        review.findings.flatMap(({ evidence }) => evidence.map(({ sourceId }) => sourceId)),
      ),
    ],
  };
}

function reviewWorktreeScenario(
  reviewId: string,
  files: ChangedFile[],
  policy: Parameters<typeof reviewWorktree>[0]['policy'],
): ReviewRunContract {
  return reviewWorktree({
    changeSet: worktreeChangeSet(files),
    createdAt: '2026-07-19T12:00:00.000Z',
    policy,
    repositoryId: 'repository_golden_evaluation' as RepositoryId,
    reviewId: reviewId as ReviewId,
  });
}

function assertExpectedOutcomes(outcomes: readonly GoldenOutcome[]): void {
  const expected: Record<GoldenScenario, ReviewRunContract['verdict']> = {
    'clean-bug-fix': 'FAST_PATH',
    'missing-test': 'REQUIRE_CHANGES',
    'protected-path': 'BLOCK',
    'auth-escalation': 'ESCALATE',
    'redis-revival': 'ESCALATE',
    'prompt-injection': 'ESCALATE',
  };
  if (outcomes.some(({ scenario, verdict }) => expected[scenario] !== verdict)) {
    throw new Error('Golden evaluation returned an unexpected verdict.');
  }
}

export async function evaluateGoldenScenarios(
  options: JudgeDemoOptions = {},
): Promise<GoldenEvaluation> {
  const testRelationship = {
    version: 1 as const,
    tests: {
      relationships: [
        {
          id: 'source-needs-tests',
          source: ['src/**'],
          tests: ['tests/**'],
          enforcement: 'required' as const,
        },
      ],
    },
  };
  const clean = reviewWorktreeScenario(
    'review_clean_bug_fix',
    [changedFile('src/cache.ts'), changedFile('tests/cache.test.ts')],
    testRelationship,
  );
  const missingTest = reviewWorktreeScenario(
    'review_missing_test',
    [changedFile('src/cache.ts')],
    testRelationship,
  );
  const protectedPath = reviewWorktreeScenario(
    'review_protected_path',
    [changedFile('internal/protected/rules.ts')],
    {
      version: 1,
      protectedPaths: [
        {
          id: 'protected-rules',
          paths: ['internal/protected/**'],
          enforcement: 'hard',
          message: 'This path requires the authorized policy workflow.',
        },
      ],
    },
  );
  const authEscalation = reviewWorktreeScenario(
    'review_auth_escalation',
    [changedFile('src/auth/session.ts')],
    {
      version: 1,
      riskZones: [
        {
          id: 'authentication',
          paths: ['src/auth/**'],
          level: 'critical',
          verdictFloor: 'ESCALATE',
        },
      ],
    },
  );
  const fixture = await loadGhostChangeFixture();
  const provider = createGitHubProvider({ runGh: createGhostChangeRunner(fixture) });
  const remote = normalizeGitHubRemote(fixture.remote);
  const [pullRequest, changeSet, judgeSmoke] = await Promise.all([
    provider.getPullRequest(remote, fixture.pullRequestNumber),
    provider.getPullRequestDiff(remote, fixture.pullRequestNumber),
    runJudgeDemoSmoke(options),
  ]);
  const promptInjection = reviewPullRequest({
    changeSet,
    pullRequest,
    createdAt: '2026-07-19T12:00:00.000Z',
    policy: testRelationship,
    repositoryId: 'repository_golden_evaluation' as RepositoryId,
    reviewId: 'review_prompt_injection' as ReviewId,
  });
  const outcomes = [
    toOutcome('clean-bug-fix', clean),
    toOutcome('missing-test', missingTest),
    toOutcome('protected-path', protectedPath),
    toOutcome('auth-escalation', authEscalation),
    {
      scenario: 'redis-revival' as const,
      verdict: judgeSmoke.verdict,
      findingIds: [],
      evidenceIds: judgeSmoke.evidenceIds,
    },
    toOutcome('prompt-injection', promptInjection),
  ];
  assertExpectedOutcomes(outcomes);

  return { externalNetworkCalls: 0, modelCalls: 0, outcomes };
}

export function formatGoldenEvaluation(evaluation: GoldenEvaluation): string {
  const header = ['Scenario', 'Verdict', 'Stable finding or evidence IDs'];
  const values = evaluation.outcomes.map(({ scenario, verdict, findingIds, evidenceIds }) => [
    scenario,
    verdict,
    [...findingIds, ...evidenceIds].join(', ') || 'none',
  ]);
  const widths = header.map((cell, index) =>
    Math.max(cell.length, ...values.map((row) => row[index]!.length)),
  );
  const row = (cells: readonly string[]) =>
    `| ${cells.map((cell, index) => cell.padEnd(widths[index]!)).join(' | ')} |`;
  return [
    '# Golden evaluation',
    '',
    'This report is regenerated by `pnpm eval` from local fixture/provider/review code. It makes no external network request and no model call.',
    '',
    `- External network calls: ${evaluation.externalNetworkCalls}`,
    `- Model calls: ${evaluation.modelCalls}`,
    '',
    row(header),
    `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`,
    ...values.map(row),
    '',
    'All expected verdicts passed. `BLOCK` appears only for the deterministic protected-path policy; the escalation scenarios remain `ESCALATE`.',
    '',
  ].join('\n');
}

async function writeGoldenEvaluation(): Promise<void> {
  const report = formatGoldenEvaluation(await evaluateGoldenScenarios());
  if (!process.argv.includes('--smoke')) {
    const reportPath = fileURLToPath(
      new URL('../docs/release/golden-evaluation.md', import.meta.url),
    );
    await writeFile(reportPath, report, 'utf8');
  }
  process.stdout.write(report);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeGoldenEvaluation();
}
