import {
  changeSetSchema,
  githubHistoryBatchSchema,
  githubPreflightSchema,
  githubRemoteRecordSchema,
  githubRemoteSchema,
  githubSyncLimitsSchema,
  pullRequestRecordSchema,
  type ChangeSet,
  type GitHubHistoryBatch,
  type GitHubRemote,
  type GitHubRemoteRecord,
  type GitHubSyncLimits,
  type PullRequestRecord,
} from '@gatekeeper/contracts';
import { execa } from 'execa';
import { z } from 'zod';

const MAX_OUTPUT_BYTES = 2 * 1_024 * 1_024;
const MAX_ADDED_LINES = 500;
const MAX_ADDED_LINE_LENGTH = 2_000;
const API_PAGE_SIZE = 100;

export interface GhCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  failureReason?: 'max_buffer' | 'timeout';
}

export type RunGh = (arguments_: readonly string[]) => Promise<GhCommandResult>;

export type GitHubProviderErrorCode =
  | 'AUTH_REQUIRED'
  | 'GH_COMMAND_FAILED'
  | 'GH_OUTPUT_TOO_LARGE'
  | 'GH_UNAVAILABLE'
  | 'INVALID_REMOTE'
  | 'INVALID_RESPONSE'
  | 'PULL_REQUEST_TOO_LARGE';

export class GitHubProviderError extends Error {
  public constructor(
    public readonly code: GitHubProviderErrorCode,
    message: string,
    public readonly repair?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GitHubProviderError';
  }
}

export interface GitHubProvider {
  preflight(remote: GitHubRemote): Promise<ReturnType<typeof githubPreflightSchema.parse>>;
  getPullRequest(remote: GitHubRemote, number: number): Promise<PullRequestRecord>;
  getPullRequestDiff(
    remote: GitHubRemote,
    number: number,
    limits?: GitHubSyncLimits,
  ): Promise<ChangeSet>;
  listHistoricalDocuments(
    remote: GitHubRemote,
    limits?: GitHubSyncLimits,
    cursor?: string | null,
  ): Promise<GitHubHistoryBatch>;
}

interface CreateGitHubProviderOptions {
  runGh?: RunGh;
}

const rawPullRequestSchema = z.object({
  number: z.int().positive(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.enum(['OPEN', 'CLOSED', 'MERGED']),
  url: z.string(),
  author: z.object({ login: z.string() }).nullable(),
  baseRefName: z.string(),
  headRefName: z.string(),
  headRefOid: z.string(),
  additions: z.int().nonnegative(),
  deletions: z.int().nonnegative(),
  changedFiles: z.int().nonnegative(),
  isDraft: z.boolean(),
  closingIssuesReferences: z.array(z.object({ number: z.int().positive() })),
  statusCheckRollup: z.array(z.record(z.string(), z.unknown())).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedAt: z.string().nullable(),
  mergedAt: z.string().nullable(),
});

const rawPullRequestFileSchema = z.object({
  filename: z.string(),
  previous_filename: z.string().optional(),
  status: z.enum(['added', 'modified', 'removed', 'renamed', 'copied', 'changed', 'unchanged']),
  additions: z.int().nonnegative(),
  deletions: z.int().nonnegative(),
  patch: z.string().optional(),
});

const rawIssueSchema = z.object({
  number: z.int().positive(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.enum(['open', 'closed']),
  html_url: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  pull_request: z.unknown().optional(),
});

const rawPullHistorySchema = rawIssueSchema.omit({ pull_request: true });

const rawIssueCommentSchema = z.object({
  id: z.int().positive(),
  body: z.string().nullable(),
  html_url: z.string(),
  issue_url: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const rawReviewCommentSchema = z.object({
  id: z.int().positive(),
  body: z.string().nullable(),
  html_url: z.string(),
  pull_request_url: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const rawReviewSchema = z.object({
  id: z.int().positive(),
  body: z.string().nullable(),
  html_url: z.string(),
  state: z.string(),
  submitted_at: z.string().nullable(),
});

async function runGhCommand(arguments_: readonly string[]): Promise<GhCommandResult> {
  const command = await execa('gh', arguments_, {
    maxBuffer: MAX_OUTPUT_BYTES,
    reject: false,
    shell: false,
    stdin: 'ignore',
    timeout: 30_000,
  });
  return {
    exitCode: command.exitCode ?? -1,
    stdout: command.stdout,
    stderr: command.stderr,
    ...(command.isMaxBuffer ? { failureReason: 'max_buffer' as const } : {}),
    ...(command.timedOut ? { failureReason: 'timeout' as const } : {}),
  };
}

function invalidRemote(): never {
  throw new GitHubProviderError(
    'INVALID_REMOTE',
    'The origin remote must identify exactly one GitHub owner/repository.',
  );
}

function normalizedRemote(hostValue: string, pathValue: string): GitHubRemote {
  const host = hostValue.toLowerCase();
  if (host !== 'github.com') {
    return invalidRemote();
  }
  const path = pathValue.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
  const parts = path.split('/');
  if (parts.length !== 2) {
    return invalidRemote();
  }
  const owner = parts[0]?.toLowerCase();
  const name = parts[1]?.toLowerCase();
  if (
    owner === undefined ||
    name === undefined ||
    !/^[a-z0-9_.-]+$/.test(host) ||
    !/^[a-z0-9_.-]+$/.test(owner) ||
    !/^[a-z0-9_.-]+$/.test(name)
  ) {
    return invalidRemote();
  }
  return githubRemoteSchema.parse({
    host,
    owner,
    name,
    nameWithOwner: `${owner}/${name}`,
    url: `https://${host}/${owner}/${name}`,
  });
}

export function normalizeGitHubRemote(value: string): GitHubRemote {
  const remote = value.trim();
  const scp = /^git@([^:]+):(.+)$/.exec(remote);
  if (scp !== null) {
    return normalizedRemote(scp[1] ?? '', scp[2] ?? '');
  }

  let url: URL;
  try {
    url = new URL(remote);
  } catch {
    return invalidRemote();
  }
  if (url.protocol !== 'https:' && url.protocol !== 'ssh:') {
    return invalidRemote();
  }
  if (
    url.password !== '' ||
    (url.username !== '' && !(url.protocol === 'ssh:' && url.username === 'git'))
  ) {
    return invalidRemote();
  }
  if (url.port !== '' || url.search !== '' || url.hash !== '') {
    return invalidRemote();
  }
  return normalizedRemote(url.hostname, url.pathname);
}

export function pullRequestToRemoteRecord(pullRequest: PullRequestRecord): GitHubRemoteRecord {
  return githubRemoteRecordSchema.parse({
    kind: 'pull_request',
    sourceId: `pull_request:#${pullRequest.number}`,
    number: pullRequest.number,
    parentSourceId: null,
    title: pullRequest.title,
    body: pullRequest.body,
    url: pullRequest.url,
    state: pullRequest.state.toLowerCase(),
    createdAt: pullRequest.createdAt,
    updatedAt: pullRequest.updatedAt,
  });
}

function safeJson(output: string): unknown {
  if (Buffer.byteLength(output, 'utf8') > MAX_OUTPUT_BYTES) {
    throw new GitHubProviderError('GH_OUTPUT_TOO_LARGE', 'GitHub CLI output exceeded 2 MiB.');
  }
  try {
    return JSON.parse(output) as unknown;
  } catch (error) {
    throw new GitHubProviderError(
      'INVALID_RESPONSE',
      'GitHub CLI returned malformed JSON.',
      undefined,
      { cause: error },
    );
  }
}

async function execute(runGh: RunGh, arguments_: readonly string[]): Promise<GhCommandResult> {
  let result: GhCommandResult;
  try {
    result = await runGh(arguments_);
  } catch (error) {
    throw new GitHubProviderError(
      'GH_UNAVAILABLE',
      'GitHub CLI is unavailable.',
      'Install GitHub CLI, then retry.',
      { cause: error },
    );
  }
  if (result.failureReason !== undefined) {
    throw new GitHubProviderError(
      result.failureReason === 'max_buffer' ? 'GH_OUTPUT_TOO_LARGE' : 'GH_COMMAND_FAILED',
      result.failureReason === 'max_buffer'
        ? 'GitHub CLI output exceeded 2 MiB.'
        : 'GitHub CLI timed out.',
    );
  }
  if (Buffer.byteLength(result.stdout, 'utf8') > MAX_OUTPUT_BYTES) {
    throw new GitHubProviderError('GH_OUTPUT_TOO_LARGE', 'GitHub CLI output exceeded 2 MiB.');
  }
  return result;
}

async function executeJson(runGh: RunGh, arguments_: readonly string[]): Promise<unknown> {
  const result = await execute(runGh, arguments_);
  if (result.exitCode !== 0) {
    throw new GitHubProviderError('GH_COMMAND_FAILED', 'A read-only GitHub CLI request failed.');
  }
  return safeJson(result.stdout);
}

function checkState(records: Array<Record<string, unknown>> | null): PullRequestRecord['checks'] {
  if (records === null || records.length === 0) {
    return 'unknown';
  }
  const values = records.flatMap((record) =>
    [record['state'], record['status'], record['conclusion']]
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.toUpperCase()),
  );
  if (
    values.some((value) =>
      ['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED'].includes(value),
    )
  ) {
    return 'fail';
  }
  if (
    values.some((value) =>
      ['PENDING', 'QUEUED', 'IN_PROGRESS', 'WAITING', 'EXPECTED'].includes(value),
    )
  ) {
    return 'pending';
  }
  return values.some((value) => ['SUCCESS', 'NEUTRAL', 'SKIPPED', 'COMPLETED'].includes(value))
    ? 'pass'
    : 'unknown';
}

function parsePullRequest(value: unknown): PullRequestRecord {
  let raw;
  try {
    raw = rawPullRequestSchema.parse(value);
  } catch (error) {
    throw new GitHubProviderError(
      'INVALID_RESPONSE',
      'GitHub CLI returned invalid pull-request metadata.',
      undefined,
      { cause: error },
    );
  }
  return pullRequestRecordSchema.parse({
    number: raw.number,
    title: raw.title.trim().slice(0, 300),
    body: (raw.body ?? '').slice(0, 20_000),
    state: raw.state,
    url: raw.url,
    author: raw.author?.login ?? null,
    baseRefName: raw.baseRefName,
    headRefName: raw.headRefName,
    headRefOid: raw.headRefOid,
    additions: raw.additions,
    deletions: raw.deletions,
    changedFiles: raw.changedFiles,
    checks: checkState(raw.statusCheckRollup),
    isDraft: raw.isDraft,
    closingIssueNumbers: raw.closingIssuesReferences.map(({ number }) => number),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    closedAt: raw.closedAt,
    mergedAt: raw.mergedAt,
  });
}

function status(value: z.infer<typeof rawPullRequestFileSchema>['status']) {
  if (value === 'added' || value === 'copied') {
    return 'added' as const;
  }
  if (value === 'removed') {
    return 'deleted' as const;
  }
  if (value === 'renamed') {
    return 'renamed' as const;
  }
  return 'modified' as const;
}

function addedLines(patch: string | undefined): { lines: string[]; truncated: boolean } {
  if (patch === undefined) {
    return { lines: [], truncated: true };
  }
  const lines: string[] = [];
  let truncated = false;
  for (const rawLine of patch.split('\n')) {
    if (!rawLine.startsWith('+') || rawLine.startsWith('+++')) {
      continue;
    }
    const line = rawLine.slice(1);
    if (lines.length < MAX_ADDED_LINES) {
      lines.push(line.slice(0, MAX_ADDED_LINE_LENGTH));
    } else {
      truncated = true;
    }
    if (line.length > MAX_ADDED_LINE_LENGTH) {
      truncated = true;
    }
  }
  return { lines, truncated };
}

function endpointNumber(value: string): number | undefined {
  const match = /\/(?:issues|pulls)\/(\d+)$/.exec(value);
  const number = Number(match?.[1]);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

function remoteRecord(
  value: Omit<GitHubRemoteRecord, 'body' | 'title'> & { body: string | null; title: string },
): GitHubRemoteRecord {
  return githubRemoteRecordSchema.parse({
    ...value,
    title: value.title.trim().slice(0, 300) || 'Untitled GitHub record',
    body: (value.body ?? '').slice(0, 20_000),
  });
}

function normalizeIssue(value: z.infer<typeof rawIssueSchema>): GitHubRemoteRecord | undefined {
  if (value.pull_request !== undefined) {
    return undefined;
  }
  return remoteRecord({
    kind: 'issue',
    sourceId: `issue:#${value.number}`,
    number: value.number,
    parentSourceId: null,
    title: value.title,
    body: value.body,
    url: value.html_url,
    state: value.state,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  });
}

function normalizePull(value: z.infer<typeof rawPullHistorySchema>): GitHubRemoteRecord {
  return remoteRecord({
    kind: 'pull_request',
    sourceId: `pull_request:#${value.number}`,
    number: value.number,
    parentSourceId: null,
    title: value.title,
    body: value.body,
    url: value.html_url,
    state: value.state,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  });
}

function normalizeIssueComment(value: z.infer<typeof rawIssueCommentSchema>): GitHubRemoteRecord {
  const parent = endpointNumber(value.issue_url);
  if (parent === undefined) {
    throw new Error('missing issue parent');
  }
  return remoteRecord({
    kind: 'issue_comment',
    sourceId: `comment:issue:${value.id}`,
    parentSourceId: `issue:#${parent}`,
    title: `Comment on issue #${parent}`,
    body: value.body,
    url: value.html_url,
    state: 'historical',
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  });
}

function normalizeReviewComment(value: z.infer<typeof rawReviewCommentSchema>): GitHubRemoteRecord {
  const parent = endpointNumber(value.pull_request_url);
  if (parent === undefined) {
    throw new Error('missing pull-request parent');
  }
  return remoteRecord({
    kind: 'review_comment',
    sourceId: `comment:review:${value.id}`,
    parentSourceId: `pull_request:#${parent}`,
    title: `Review comment on pull request #${parent}`,
    body: value.body,
    url: value.html_url,
    state: 'historical',
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  });
}

function normalizeReview(
  value: z.infer<typeof rawReviewSchema>,
  pullRequestNumber: number,
): GitHubRemoteRecord {
  const occurredAt = value.submitted_at ?? '1970-01-01T00:00:00Z';
  return remoteRecord({
    kind: 'review',
    sourceId: `comment:review-summary:${value.id}`,
    parentSourceId: `pull_request:#${pullRequestNumber}`,
    title: `Review on pull request #${pullRequestNumber}`,
    body: value.body,
    url: value.html_url,
    state: value.state.toLowerCase().slice(0, 50) || 'historical',
    createdAt: occurredAt,
    updatedAt: occurredAt,
  });
}

interface CollectionSpec {
  source: string;
  arguments: string[];
  schema: z.ZodType;
  normalize: (value: never) => GitHubRemoteRecord | undefined;
}

async function readCollection(
  runGh: RunGh,
  spec: CollectionSpec,
  records: GitHubRemoteRecord[],
  failures: GitHubHistoryBatch['failures'],
): Promise<void> {
  let raw: unknown;
  try {
    raw = await executeJson(runGh, spec.arguments);
  } catch {
    failures.push({ source: spec.source, code: 'unavailable' });
    return;
  }
  if (!Array.isArray(raw)) {
    failures.push({ source: spec.source, code: 'unavailable' });
    return;
  }
  for (const [index, value] of raw.entries()) {
    const parsed = spec.schema.safeParse(value);
    if (!parsed.success) {
      failures.push({ source: `${spec.source}[${index}]`, code: 'malformed_record' });
      continue;
    }
    try {
      const record = spec.normalize(parsed.data as never);
      if (record !== undefined) {
        records.push(record);
      }
    } catch {
      failures.push({ source: `${spec.source}[${index}]`, code: 'malformed_record' });
    }
  }
}

function apiArguments(endpoint: string): string[] {
  return ['api', '--method', 'GET', endpoint];
}

function historyEndpoint(
  remote: GitHubRemote,
  resource: string,
  limit: number,
  cursor: string | null,
): string {
  const since = cursor === null ? '' : `&since=${encodeURIComponent(cursor)}`;
  return `repos/${remote.nameWithOwner}/${resource}?sort=updated&direction=desc&per_page=${limit}${since}`;
}

export function createGitHubProvider(options: CreateGitHubProviderOptions = {}): GitHubProvider {
  const runGh = options.runGh ?? runGhCommand;
  return {
    preflight: async (remote) => {
      const result = await execute(runGh, [
        'auth',
        'status',
        '--active',
        '--hostname',
        remote.host,
      ]);
      if (result.exitCode !== 0) {
        throw new GitHubProviderError(
          'AUTH_REQUIRED',
          `GitHub CLI authentication is required for ${remote.host}.`,
          `Run \`gh auth login --hostname ${remote.host}\`, then retry.`,
        );
      }
      return githubPreflightSchema.parse({
        schemaVersion: 1,
        host: remote.host,
        authenticated: true,
      });
    },
    getPullRequest: async (remote, number) => {
      if (!Number.isSafeInteger(number) || number <= 0) {
        throw new GitHubProviderError('INVALID_RESPONSE', 'Pull-request number must be positive.');
      }
      const fields = [
        'number',
        'title',
        'body',
        'state',
        'url',
        'author',
        'baseRefName',
        'headRefName',
        'headRefOid',
        'additions',
        'deletions',
        'changedFiles',
        'isDraft',
        'closingIssuesReferences',
        'statusCheckRollup',
        'createdAt',
        'updatedAt',
        'closedAt',
        'mergedAt',
      ].join(',');
      return parsePullRequest(
        await executeJson(runGh, [
          'pr',
          'view',
          String(number),
          '--repo',
          remote.nameWithOwner,
          '--json',
          fields,
        ]),
      );
    },
    getPullRequestDiff: async (remote, number, inputLimits) => {
      if (!Number.isSafeInteger(number) || number <= 0) {
        throw new GitHubProviderError('INVALID_RESPONSE', 'Pull-request number must be positive.');
      }
      const limits = githubSyncLimitsSchema.parse(inputLimits ?? {});
      const files: z.infer<typeof rawPullRequestFileSchema>[] = [];
      for (let page = 1; ; page += 1) {
        const raw = await executeJson(
          runGh,
          apiArguments(
            `repos/${remote.nameWithOwner}/pulls/${number}/files?per_page=${API_PAGE_SIZE}&page=${page}`,
          ),
        );
        if (!Array.isArray(raw)) {
          throw new GitHubProviderError(
            'INVALID_RESPONSE',
            'GitHub CLI returned invalid pull-request files.',
          );
        }
        const pageFiles = raw.map((value) => {
          try {
            return rawPullRequestFileSchema.parse(value);
          } catch (error) {
            throw new GitHubProviderError(
              'INVALID_RESPONSE',
              'GitHub CLI returned invalid pull-request files.',
              undefined,
              { cause: error },
            );
          }
        });
        if (files.length + pageFiles.length > limits.maxPullRequestFiles) {
          throw new GitHubProviderError(
            'PULL_REQUEST_TOO_LARGE',
            `The pull request exceeds the ${limits.maxPullRequestFiles}-file inspection limit.`,
          );
        }
        files.push(...pageFiles);
        if (pageFiles.length < API_PAGE_SIZE) {
          break;
        }
      }
      return changeSetSchema.parse({
        schemaVersion: 1,
        target: {
          kind: 'pull_request',
          display: `Pull request #${number}`,
          pullRequestNumber: number,
        },
        files: files.map((file) => {
          const lines = addedLines(file.patch);
          const mappedStatus = status(file.status);
          return {
            path: file.filename,
            ...(mappedStatus === 'renamed' ? { previousPath: file.previous_filename } : {}),
            status: mappedStatus,
            additions: file.additions,
            deletions: file.deletions,
            binary: file.patch === undefined && file.additions === 0 && file.deletions === 0,
            contentTruncated: lines.truncated,
            addedLines: lines.lines,
          };
        }),
      });
    },
    listHistoricalDocuments: async (remote, inputLimits, inputCursor = null) => {
      const limits = githubSyncLimitsSchema.parse(inputLimits ?? {});
      const cursor = inputCursor ?? null;
      const records: GitHubRemoteRecord[] = [];
      const failures: GitHubHistoryBatch['failures'] = [];

      await readCollection(
        runGh,
        {
          source: 'issues',
          arguments: apiArguments(
            `repos/${remote.nameWithOwner}/issues?state=all&sort=updated&direction=desc&per_page=${limits.issueLimit}${
              cursor === null ? '' : `&since=${encodeURIComponent(cursor)}`
            }`,
          ),
          schema: rawIssueSchema,
          normalize: normalizeIssue,
        },
        records,
        failures,
      );
      const pullStart = records.length;
      await readCollection(
        runGh,
        {
          source: 'pull_requests',
          arguments: apiArguments(
            `repos/${remote.nameWithOwner}/pulls?state=all&sort=updated&direction=desc&per_page=${limits.pullRequestLimit}`,
          ),
          schema: rawPullHistorySchema,
          normalize: normalizePull,
        },
        records,
        failures,
      );
      await readCollection(
        runGh,
        {
          source: 'issue_comments',
          arguments: apiArguments(
            historyEndpoint(remote, 'issues/comments', limits.commentLimit, cursor),
          ),
          schema: rawIssueCommentSchema,
          normalize: normalizeIssueComment,
        },
        records,
        failures,
      );
      await readCollection(
        runGh,
        {
          source: 'review_comments',
          arguments: apiArguments(
            historyEndpoint(remote, 'pulls/comments', limits.commentLimit, cursor),
          ),
          schema: rawReviewCommentSchema,
          normalize: normalizeReviewComment,
        },
        records,
        failures,
      );

      if (limits.reviewLimitPerPullRequest > 0) {
        const pulls = records
          .slice(pullStart)
          .filter((record) => record.kind === 'pull_request' && record.number !== null);
        for (const pull of pulls) {
          const number = pull.number;
          if (number === undefined || number === null) {
            continue;
          }
          await readCollection(
            runGh,
            {
              source: `reviews:#${number}`,
              arguments: apiArguments(
                `repos/${remote.nameWithOwner}/pulls/${number}/reviews?per_page=${limits.reviewLimitPerPullRequest}`,
              ),
              schema: rawReviewSchema,
              normalize: (value) => normalizeReview(value, number),
            },
            records,
            failures,
          );
        }
      }

      const filtered =
        cursor === null ? records : records.filter(({ updatedAt }) => updatedAt > cursor);
      filtered.sort(
        (left, right) =>
          left.updatedAt.localeCompare(right.updatedAt) ||
          left.sourceId.localeCompare(right.sourceId),
      );
      const nextCursor = filtered.reduce<string | null>(
        (latest, { updatedAt }) => (latest === null || updatedAt > latest ? updatedAt : latest),
        cursor,
      );
      return githubHistoryBatchSchema.parse({
        schemaVersion: 1,
        records: filtered,
        failures,
        cursor: nextCursor,
        partial: failures.length > 0,
      });
    },
  };
}
