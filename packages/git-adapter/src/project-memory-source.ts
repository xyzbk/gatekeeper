import {
  gitCommitRecordSchema,
  repositoryRelativePathSchema,
  trackedFileRecordSchema,
  type GitCommitRecord,
  type TrackedFileRecord,
} from '@gatekeeper/contracts';

import type { GitCommandResult, RunGit } from './repository-path.js';

const MAX_GIT_OUTPUT_BYTES = 2 * 1_024 * 1_024;
const MAX_DOCUMENT_BYTES = 256 * 1_024;
const MAX_TRACKED_FILES = 50_000;
const MAX_COMMITS = 200;
const MAX_LOCAL_BRANCHES = 500;
const MAX_COMMIT_PAGE_CURSOR = 50_000;
const MAX_COMMIT_PAGE_SIZE = 48;

export interface LocalBranch {
  name: string;
  ref: string;
}

export interface LocalCommitPageInput {
  ref: string;
  cursor: number;
  limit: number;
  sort: 'newest' | 'oldest';
  authoredAfter?: string;
  authoredBefore?: string;
}

export type ProjectMemorySourceErrorCode =
  | 'FILE_TOO_LARGE'
  | 'GIT_COMMAND_FAILED'
  | 'GIT_OUTPUT_TOO_LARGE'
  | 'INVALID_FILE_CONTENT'
  | 'INVALID_LIMIT'
  | 'INVALID_REF'
  | 'MALFORMED_GIT_OUTPUT'
  | 'UNSAFE_PATH';

export class ProjectMemorySourceError extends Error {
  public constructor(
    public readonly code: ProjectMemorySourceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProjectMemorySourceError';
  }
}

function outputBytes(output: string): number {
  return Buffer.byteLength(output, 'utf8');
}

function successfulResult(result: GitCommandResult): string {
  if (result.failureReason === 'max_buffer' || outputBytes(result.stdout) > MAX_GIT_OUTPUT_BYTES) {
    throw new ProjectMemorySourceError(
      'GIT_OUTPUT_TOO_LARGE',
      'Git returned more Project Memory metadata than the 2 MiB safety limit.',
    );
  }
  if (result.exitCode !== 0) {
    throw new ProjectMemorySourceError(
      'GIT_COMMAND_FAILED',
      'Git could not read the bounded Project Memory source.',
    );
  }
  return result.stdout;
}

function splitNullTerminated(output: string): string[] {
  const values = output.split('\0');
  if (values.at(-1) === '') {
    values.pop();
  }
  return values;
}

function malformedOutput(): never {
  throw new ProjectMemorySourceError(
    'MALFORMED_GIT_OUTPUT',
    'Git returned malformed Project Memory metadata.',
  );
}

function validLocalBranchRef(ref: string): boolean {
  const prefix = 'refs/heads/';
  if (!ref.startsWith(prefix)) {
    return false;
  }
  const name = ref.slice(prefix.length);
  const containsUnsafeControl = [...name].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 32 || code === 127;
  });
  return (
    name.length > 0 &&
    name.length <= 255 &&
    !name.startsWith('-') &&
    !name.endsWith('.') &&
    !name.includes('..') &&
    !name.includes('//') &&
    !name.includes('@{') &&
    !containsUnsafeControl &&
    !/[~^:?*[\\]/.test(name) &&
    !name.split('/').some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  );
}

function validIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

function parseCommitRecords(output: string): GitCommitRecord[] {
  if (output.length === 0) {
    return [];
  }
  const values = splitNullTerminated(output);
  if (values.length % 4 !== 0) {
    return malformedOutput();
  }

  const commits: GitCommitRecord[] = [];
  for (let index = 0; index < values.length; index += 4) {
    const sha = values[index]?.trim();
    const authoredAt = values[index + 1]?.trim();
    const title = values[index + 2]?.trim().slice(0, 300);
    const message = values[index + 3]?.trim().slice(0, 2_000);
    if (
      sha === undefined ||
      authoredAt === undefined ||
      title === undefined ||
      message === undefined
    ) {
      return malformedOutput();
    }
    const parsed = gitCommitRecordSchema.safeParse({ sha, authoredAt, title, message });
    if (!parsed.success) {
      return malformedOutput();
    }
    commits.push(parsed.data);
  }
  return commits;
}

export async function listLocalBranches(
  repositoryRoot: string,
  runGit: RunGit,
): Promise<LocalBranch[]> {
  const output = successfulResult(
    await runGit(['-C', repositoryRoot, 'for-each-ref', '--format=%(refname)%00', 'refs/heads']),
  );
  const refs = splitNullTerminated(output)
    .map((ref) => ref.trim())
    .filter((ref) => ref.length > 0);
  if (refs.length > MAX_LOCAL_BRANCHES) {
    throw new ProjectMemorySourceError(
      'GIT_OUTPUT_TOO_LARGE',
      'Git returned more local branches than the 500-branch safety limit.',
    );
  }
  return refs.map((ref) => {
    if (!validLocalBranchRef(ref)) {
      return malformedOutput();
    }
    return { name: ref.slice('refs/heads/'.length), ref };
  });
}

export async function listBranchCommits(
  repositoryRoot: string,
  input: LocalCommitPageInput,
  runGit: RunGit,
): Promise<GitCommitRecord[]> {
  if (!validLocalBranchRef(input.ref)) {
    throw new ProjectMemorySourceError(
      'INVALID_REF',
      'Commit Explorer requires a listed local branch ref.',
    );
  }
  if (
    !Number.isInteger(input.cursor) ||
    input.cursor < 0 ||
    input.cursor > MAX_COMMIT_PAGE_CURSOR ||
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > MAX_COMMIT_PAGE_SIZE
  ) {
    throw new ProjectMemorySourceError(
      'INVALID_LIMIT',
      'Commit Explorer history requests must use the bounded cursor and page size.',
    );
  }
  if (
    (input.authoredAfter !== undefined && !validIsoDate(input.authoredAfter)) ||
    (input.authoredBefore !== undefined && !validIsoDate(input.authoredBefore))
  ) {
    throw new ProjectMemorySourceError(
      'INVALID_REF',
      'Commit Explorer requires canonical authored-date filters.',
    );
  }
  const arguments_ = [
    '-C',
    repositoryRoot,
    'log',
    '--no-decorate',
    `--max-count=${input.limit}`,
    `--skip=${input.cursor}`,
    '--format=format:%H%x00%aI%x00%s%x00%b%x00',
    ...(input.sort === 'oldest' ? ['--reverse'] : []),
    ...(input.authoredAfter === undefined ? [] : [`--since=${input.authoredAfter}T00:00:00.000Z`]),
    ...(input.authoredBefore === undefined ? [] : [`--until=${input.authoredBefore}T23:59:59.999Z`]),
    input.ref,
  ];
  return parseCommitRecords(successfulResult(await runGit(arguments_)));
}

export async function listTrackedFiles(
  repositoryRoot: string,
  runGit: RunGit,
): Promise<TrackedFileRecord[]> {
  const output = successfulResult(
    await runGit(['-C', repositoryRoot, 'ls-tree', '-r', '-z', '--long', 'HEAD']),
  );
  const records = splitNullTerminated(output);
  if (records.length > MAX_TRACKED_FILES) {
    throw new ProjectMemorySourceError(
      'GIT_OUTPUT_TOO_LARGE',
      'The committed tree exceeds the 50,000-file Project Memory limit.',
    );
  }

  return records.flatMap((record) => {
    const match = /^(\d{6}) (blob|commit) ([0-9a-f]{40,64})\s+(-|\d+)\t(.+)$/.exec(record);
    if (match === null) {
      return malformedOutput();
    }
    const [, mode, type, objectId, size, path] = match;
    if (
      mode === undefined ||
      type === undefined ||
      objectId === undefined ||
      size === undefined ||
      path === undefined
    ) {
      return malformedOutput();
    }
    if (type === 'commit') {
      return [];
    }
    const sizeBytes = size === '-' ? null : Number(size);
    if (sizeBytes !== null && (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0)) {
      return malformedOutput();
    }
    const parsed = trackedFileRecordSchema.safeParse({ path, objectId, mode, sizeBytes });
    return parsed.success ? [parsed.data] : malformedOutput();
  });
}

function validRef(ref: string): boolean {
  return ref === 'HEAD' || /^[0-9a-f]{40,64}$/.test(ref);
}

export async function readFileAtRef(
  repositoryRoot: string,
  relativePath: string,
  ref: string,
  runGit: RunGit,
): Promise<string> {
  const parsedPath = repositoryRelativePathSchema.safeParse(relativePath);
  if (!parsedPath.success) {
    throw new ProjectMemorySourceError(
      'UNSAFE_PATH',
      'Project Memory requires a canonical repository-relative path.',
    );
  }
  if (!validRef(ref)) {
    throw new ProjectMemorySourceError(
      'INVALID_REF',
      'Project Memory may read only HEAD or a full commit SHA.',
    );
  }

  const result = await runGit([
    '-C',
    repositoryRoot,
    'show',
    '--no-textconv',
    `${ref}:${parsedPath.data}`,
  ]);
  if (result.failureReason === 'max_buffer' || outputBytes(result.stdout) > MAX_DOCUMENT_BYTES) {
    throw new ProjectMemorySourceError(
      'FILE_TOO_LARGE',
      'The selected document exceeds the 256 KiB indexing limit.',
    );
  }
  if (result.exitCode !== 0) {
    throw new ProjectMemorySourceError(
      'GIT_COMMAND_FAILED',
      'Git could not read the selected document at the requested ref.',
    );
  }
  if (result.stdout.includes('\u0000') || result.stdout.includes('\uFFFD')) {
    throw new ProjectMemorySourceError(
      'INVALID_FILE_CONTENT',
      'The selected document is not safe UTF-8 text.',
    );
  }
  return result.stdout;
}

export async function listCommits(
  repositoryRoot: string,
  limit: number,
  runGit: RunGit,
): Promise<GitCommitRecord[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_COMMITS) {
    throw new ProjectMemorySourceError(
      'INVALID_LIMIT',
      'Project Memory commit history must be between 1 and 200 records.',
    );
  }
  const output = successfulResult(
    await runGit([
      '-C',
      repositoryRoot,
      'log',
      '-n',
      String(limit),
      '--format=format:%H%x00%aI%x00%s%x00%b%x00',
      'HEAD',
    ]),
  );
  return parseCommitRecords(output);
}
