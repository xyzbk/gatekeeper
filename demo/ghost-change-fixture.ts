import { readFile } from 'node:fs/promises';

import type { RunGh } from '@gatekeeper/github-gh';

export type GhostChangePhase = 'revived' | 'corrected';

interface PullRequestPhaseFixture {
  pullRequestView: Record<string, unknown>;
  pullRequestFiles: unknown[];
  pullRequestHistory: Record<string, unknown>;
}

export interface GhostChangeFixture {
  schemaVersion: 1;
  remote: string;
  pullRequestNumber: number;
  github: {
    pullRequestView: Record<string, unknown>;
    pullRequestFiles: unknown[];
    issues: unknown[];
    pullRequests: unknown[];
    issueComments: unknown[];
    reviewComments: unknown[];
    reviewsByPullRequest: Record<string, unknown[]>;
    correctedPullRequest: PullRequestPhaseFixture;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseFixture(value: unknown): GhostChangeFixture {
  if (!isRecord(value) || value['schemaVersion'] !== 1 || typeof value['remote'] !== 'string') {
    throw new TypeError('Ghost Change fixture metadata is invalid.');
  }
  const pullRequestNumber = value['pullRequestNumber'];
  const github = value['github'];
  if (!Number.isSafeInteger(pullRequestNumber) || (pullRequestNumber as number) <= 0) {
    throw new TypeError('Ghost Change pull-request number is invalid.');
  }
  if (!isRecord(github)) {
    throw new TypeError('Ghost Change GitHub responses are invalid.');
  }
  const arrays = [
    'pullRequestFiles',
    'issues',
    'pullRequests',
    'issueComments',
    'reviewComments',
  ] as const;
  if (
    !isRecord(github['pullRequestView']) ||
    !isRecord(github['reviewsByPullRequest']) ||
    !isRecord(github['correctedPullRequest']) ||
    !isRecord(github['correctedPullRequest']['pullRequestView']) ||
    !Array.isArray(github['correctedPullRequest']['pullRequestFiles']) ||
    !isRecord(github['correctedPullRequest']['pullRequestHistory']) ||
    arrays.some((key) => !Array.isArray(github[key]))
  ) {
    throw new TypeError('Ghost Change GitHub response collections are invalid.');
  }
  return value as unknown as GhostChangeFixture;
}

export async function loadGhostChangeFixture(): Promise<GhostChangeFixture> {
  const source = await readFile(
    new URL('./fixtures/github/ghost-change.json', import.meta.url),
    'utf8',
  );
  return parseFixture(JSON.parse(source) as unknown);
}

function commandResult(value: unknown) {
  return Promise.resolve({ exitCode: 0, stdout: JSON.stringify(value), stderr: '' });
}

export function createGhostChangeRunner(
  fixture: GhostChangeFixture,
  getPhase: () => GhostChangePhase = () => 'revived',
): RunGh {
  return (arguments_) => {
    const corrected = getPhase() === 'corrected' ? fixture.github.correctedPullRequest : null;
    if (arguments_[0] === 'auth' && arguments_[1] === 'status') {
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    }
    if (arguments_[0] === 'pr' && arguments_[1] === 'view') {
      return commandResult(corrected?.pullRequestView ?? fixture.github.pullRequestView);
    }
    if (arguments_[0] !== 'api') {
      return Promise.reject(new Error(`Unexpected GitHub fixture command: ${arguments_[0]}`));
    }

    const endpoint = arguments_.at(-1) ?? '';
    if (endpoint.includes(`/pulls/${fixture.pullRequestNumber}/files?`)) {
      return commandResult(corrected?.pullRequestFiles ?? fixture.github.pullRequestFiles);
    }
    if (endpoint.includes('/issues?state=all&')) {
      return commandResult(fixture.github.issues);
    }
    if (endpoint.includes('/pulls?state=all&')) {
      return commandResult(
        corrected === null
          ? fixture.github.pullRequests
          : fixture.github.pullRequests.map((pullRequest) =>
              isRecord(pullRequest) && pullRequest['number'] === fixture.pullRequestNumber
                ? corrected.pullRequestHistory
                : pullRequest,
            ),
      );
    }
    if (endpoint.includes('/issues/comments?')) {
      return commandResult(fixture.github.issueComments);
    }
    if (endpoint.includes('/pulls/comments?')) {
      return commandResult(fixture.github.reviewComments);
    }
    const reviews = /\/pulls\/(\d+)\/reviews\?/.exec(endpoint);
    if (reviews?.[1] !== undefined) {
      return commandResult(fixture.github.reviewsByPullRequest[reviews[1]] ?? []);
    }
    return Promise.reject(new Error(`Unexpected GitHub fixture endpoint: ${endpoint}`));
  };
}
