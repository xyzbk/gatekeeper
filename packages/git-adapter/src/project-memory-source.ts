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
