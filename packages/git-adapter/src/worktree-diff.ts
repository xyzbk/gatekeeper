import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  changeSetSchema,
  repositoryRelativePathSchema,
  type ChangedFile,
  type ChangeSet,
  type ChangeStatus,
} from '@gatekeeper/contracts';
import ignore, { type Ignore } from 'ignore';

import { isPathWithin, resolveRepositoryRoot, type RunGit } from './repository-path.js';

const MAX_DIFF_BYTES = 2 * 1_024 * 1_024;
const MAX_IGNORE_BYTES = 64 * 1_024;
const MAX_UNTRACKED_FILE_BYTES = 1_024 * 1_024;
const MAX_CHANGED_FILES = 500;
const MAX_ADDED_LINES = 500;
const MAX_ADDED_LINE_LENGTH = 2_000;

export interface WorktreeDiffOptions {
  ignorePatterns?: readonly string[];
}

export type WorktreeDiffErrorCode =
  | 'DIFF_TOO_LARGE'
  | 'GIT_COMMAND_FAILED'
  | 'INVALID_IGNORE_FILE'
  | 'MALFORMED_DIFF'
  | 'UNSAFE_PATH';

export class WorktreeDiffError extends Error {
  public constructor(
    public readonly code: WorktreeDiffErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'WorktreeDiffError';
  }
}

interface FileIdentity {
  path: string;
  previousPath?: string;
  status: ChangeStatus;
}

interface FileStat {
  additions: number;
  binary: boolean;
  deletions: number;
}

interface AddedLineSummary {
  contentTruncated: boolean;
  lines: string[];
}

function splitNullTerminated(output: string): string[] {
  const values = output.split('\0');
  if (values.at(-1) === '') {
    values.pop();
  }
  return values;
}

function malformedDiff(): never {
  throw new WorktreeDiffError('MALFORMED_DIFF', 'Git returned a malformed worktree diff.');
}

function parseCount(value: string): number {
  if (!/^\d+$/.test(value)) {
    return malformedDiff();
  }

  const count = Number(value);
  if (!Number.isSafeInteger(count)) {
    return malformedDiff();
  }

  return count;
}

function parseNameStatus(output: string): FileIdentity[] {
  const values = splitNullTerminated(output);
  const files: FileIdentity[] = [];

  for (let index = 0; index < values.length;) {
    const statusValue = values[index++];
    if (statusValue === undefined) {
      return malformedDiff();
    }

    const statusCode = statusValue[0];
    if (statusCode === 'R') {
      const previousPath = values[index++];
      const path = values[index++];
      if (previousPath === undefined || path === undefined) {
        return malformedDiff();
      }
      files.push({ path, previousPath, status: 'renamed' });
      continue;
    }

    const path = values[index++];
    if (path === undefined) {
      return malformedDiff();
    }

    const status: ChangeStatus =
      statusCode === 'A'
        ? 'added'
        : statusCode === 'D'
          ? 'deleted'
          : statusCode === 'M' || statusCode === 'T'
            ? 'modified'
            : malformedDiff();
    files.push({ path, status });
  }

  return files;
}

function parseNumstat(output: string): Map<string, FileStat> {
  const values = splitNullTerminated(output);
  const stats = new Map<string, FileStat>();

  for (let index = 0; index < values.length;) {
    const record = values[index++];
    if (record === undefined) {
      return malformedDiff();
    }

    const fields = record.split('\t');
    if (fields.length !== 3) {
      return malformedDiff();
    }
    const additionsValue = fields[0];
    const deletionsValue = fields[1];
    let path = fields[2];
    if (additionsValue === undefined || deletionsValue === undefined || path === undefined) {
      return malformedDiff();
    }

    if (path === '') {
      const previousPath = values[index++];
      path = values[index++];
      if (previousPath === undefined || path === undefined) {
        return malformedDiff();
      }
    }

    const binary = additionsValue === '-' && deletionsValue === '-';
    if ((additionsValue === '-') !== (deletionsValue === '-')) {
      return malformedDiff();
    }
    stats.set(path, {
      additions: binary ? 0 : parseCount(additionsValue),
      deletions: binary ? 0 : parseCount(deletionsValue),
      binary,
    });
  }

  return stats;
}

function parseAddedLines(output: string): Map<string, AddedLineSummary> {
  const linesByPath = new Map<string, AddedLineSummary>();
  let currentPath: string | undefined;

  for (const rawLine of output.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line.startsWith('+++ ')) {
      const path = line.slice(4);
      currentPath = path === '/dev/null' ? undefined : path;
      continue;
    }

    if (currentPath === undefined || !line.startsWith('+')) {
      continue;
    }

    const content = line.slice(1);
    const summary = linesByPath.get(currentPath) ?? { contentTruncated: false, lines: [] };
    if (summary.lines.length < MAX_ADDED_LINES) {
      summary.lines.push(content.slice(0, MAX_ADDED_LINE_LENGTH));
    } else {
      summary.contentTruncated = true;
    }
    if (content.length > MAX_ADDED_LINE_LENGTH) {
      summary.contentTruncated = true;
    }
    linesByPath.set(currentPath, summary);
  }

  return linesByPath;
}

function requireSuccessfulDiffCommand(
  result: Awaited<ReturnType<RunGit>>,
  message: string,
  limitMessage = 'The worktree diff exceeds the 2 MiB limit.',
): string {
  if (result.failureReason === 'max_buffer') {
    throw new WorktreeDiffError('DIFF_TOO_LARGE', limitMessage);
  }
  if (Buffer.byteLength(result.stdout, 'utf8') > MAX_DIFF_BYTES) {
    throw new WorktreeDiffError('DIFF_TOO_LARGE', limitMessage);
  }
  if (result.exitCode !== 0) {
    throw new WorktreeDiffError('GIT_COMMAND_FAILED', message);
  }
  return result.stdout;
}

async function readIgnoreFile(repositoryRoot: string): Promise<string> {
  const path = resolve(repositoryRoot, '.gatekeeperignore');
  try {
    const pathStat = await lstat(path);
    if (pathStat.size > MAX_IGNORE_BYTES) {
      throw new WorktreeDiffError(
        'INVALID_IGNORE_FILE',
        '.gatekeeperignore exceeds the 64 KiB limit.',
      );
    }
    const canonicalPath = await realpath(path);
    if (!isPathWithin(repositoryRoot, canonicalPath)) {
      throw new WorktreeDiffError(
        'UNSAFE_PATH',
        '.gatekeeperignore resolves outside the repository.',
      );
    }
    return await readFile(canonicalPath, 'utf8');
  } catch (error) {
    if (error instanceof WorktreeDiffError) {
      throw error;
    }
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }
    throw new WorktreeDiffError(
      'INVALID_IGNORE_FILE',
      '.gatekeeperignore could not be read safely.',
      { cause: error },
    );
  }
}

async function createIgnoreMatchers(
  repositoryRoot: string,
  policyPatterns: readonly string[],
): Promise<readonly Ignore[]> {
  try {
    return [ignore().add(await readIgnoreFile(repositoryRoot)), ignore().add(policyPatterns)];
  } catch (error) {
    if (error instanceof WorktreeDiffError) {
      throw error;
    }
    throw new WorktreeDiffError('INVALID_IGNORE_FILE', 'A Gatekeeper ignore pattern is invalid.', {
      cause: error,
    });
  }
}

function isIgnored(path: string, matchers: readonly Ignore[]): boolean {
  return matchers.some((matcher) => matcher.ignores(path));
}

function requireChangeCapacity(includedFileCount: number): void {
  if (includedFileCount >= MAX_CHANGED_FILES) {
    throw new WorktreeDiffError(
      'DIFF_TOO_LARGE',
      'The worktree contains more than 500 changed paths.',
    );
  }
}

async function validatePath(repositoryRoot: string, path: string): Promise<void> {
  if (!repositoryRelativePathSchema.safeParse(path).success) {
    throw new WorktreeDiffError('UNSAFE_PATH', 'Git returned an unsafe repository path.');
  }

  const candidate = resolve(repositoryRoot, ...path.split('/'));
  if (!isPathWithin(repositoryRoot, candidate)) {
    throw new WorktreeDiffError('UNSAFE_PATH', 'A changed path escapes the repository.');
  }

  try {
    const canonicalPath = await realpath(candidate);
    if (!isPathWithin(repositoryRoot, canonicalPath)) {
      throw new WorktreeDiffError('UNSAFE_PATH', 'A changed path resolves outside the repository.');
    }
  } catch (error) {
    if (error instanceof WorktreeDiffError) {
      throw error;
    }
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new WorktreeDiffError('UNSAFE_PATH', 'A changed path could not be validated safely.', {
        cause: error,
      });
    }
  }
}

function decodeText(content: Buffer): string | undefined {
  if (content.includes(0)) {
    return undefined;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch {
    return undefined;
  }
}

async function readUntrackedFile(repositoryRoot: string, path: string): Promise<ChangedFile> {
  try {
    const absolutePath = resolve(repositoryRoot, ...path.split('/'));
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) {
      throw new WorktreeDiffError('UNSAFE_PATH', 'An untracked path is not a regular file.');
    }
    if (fileStat.size > MAX_UNTRACKED_FILE_BYTES) {
      throw new WorktreeDiffError(
        'DIFF_TOO_LARGE',
        'An untracked file exceeds the 1 MiB inspection limit.',
      );
    }

    const content = await readFile(absolutePath);
    const text = decodeText(content);
    if (text === undefined) {
      return {
        path,
        status: 'untracked',
        additions: 0,
        deletions: 0,
        binary: true,
        contentTruncated: false,
        addedLines: [],
      };
    }

    const lines = text.split(/\r?\n/);
    if (lines.at(-1) === '') {
      lines.pop();
    }
    return {
      path,
      status: 'untracked',
      additions: lines.length,
      deletions: 0,
      binary: false,
      contentTruncated:
        lines.length > MAX_ADDED_LINES || lines.some((line) => line.length > MAX_ADDED_LINE_LENGTH),
      addedLines: lines
        .slice(0, MAX_ADDED_LINES)
        .map((line) => line.slice(0, MAX_ADDED_LINE_LENGTH)),
    };
  } catch (error) {
    if (error instanceof WorktreeDiffError) {
      throw error;
    }
    throw new WorktreeDiffError('UNSAFE_PATH', 'An untracked path could not be read safely.', {
      cause: error,
    });
  }
}

async function extractTrackedFiles(
  repositoryRoot: string,
  runGit: RunGit,
  refs: readonly string[],
  matchers: readonly Ignore[],
  historical = false,
): Promise<ChangedFile[]> {
  const safeDiffOptions = historical ? ['--no-ext-diff', '--no-textconv'] : [];
  const [numstatResult, nameStatusResult, patchResult] = await Promise.all([
    runGit([
      '-C',
      repositoryRoot,
      '-c',
      'core.quotePath=false',
      'diff',
      '--numstat',
      '-z',
      '--find-renames',
      ...safeDiffOptions,
      ...refs,
      '--',
    ]),
    runGit([
      '-C',
      repositoryRoot,
      '-c',
      'core.quotePath=false',
      'diff',
      '--name-status',
      '-z',
      '--find-renames',
      ...safeDiffOptions,
      ...refs,
      '--',
    ]),
    runGit([
      '-C',
      repositoryRoot,
      '-c',
      'core.quotePath=false',
      'diff',
      '--unified=0',
      '--no-ext-diff',
      '--no-textconv',
      '--find-renames',
      '--no-prefix',
      ...refs,
      '--',
    ]),
  ]);
  const limitMessage = historical
    ? 'The historical commit diff exceeds the 2 MiB limit.'
    : 'The worktree diff exceeds the 2 MiB limit.';
  const stats = parseNumstat(
    requireSuccessfulDiffCommand(
      numstatResult,
      historical
        ? 'Git could not calculate historical commit statistics.'
        : 'Git could not calculate worktree statistics.',
      limitMessage,
    ),
  );
  const identities = parseNameStatus(
    requireSuccessfulDiffCommand(
      nameStatusResult,
      historical
        ? 'Git could not list historical commit paths.'
        : 'Git could not list changed worktree paths.',
      limitMessage,
    ),
  );
  const addedLines = parseAddedLines(
    requireSuccessfulDiffCommand(
      patchResult,
      historical
        ? 'Git could not inspect historical commit lines.'
        : 'Git could not inspect changed worktree lines.',
      limitMessage,
    ),
  );
  const files: ChangedFile[] = [];

  for (const identity of identities) {
    await validatePath(repositoryRoot, identity.path);
    if (identity.previousPath !== undefined) {
      await validatePath(repositoryRoot, identity.previousPath);
    }
    if (isIgnored(identity.path, matchers)) {
      continue;
    }
    requireChangeCapacity(files.length);
    const fileStat = stats.get(identity.path);
    if (fileStat === undefined) {
      return malformedDiff();
    }
    const lineSummary = addedLines.get(identity.path) ?? {
      contentTruncated: false,
      lines: [],
    };
    files.push({
      ...identity,
      ...fileStat,
      contentTruncated: lineSummary.contentTruncated,
      addedLines: fileStat.binary ? [] : lineSummary.lines,
    });
  }

  return files;
}

function requireCommitSha(sha: string): string {
  if (!/^[0-9a-f]{40,64}$/.test(sha)) {
    throw new WorktreeDiffError('GIT_COMMAND_FAILED', 'The requested commit ID is invalid.');
  }
  return sha;
}

function requireCommitResult(result: Awaited<ReturnType<RunGit>>, message: string): string {
  if (result.exitCode !== 0 || result.failureReason !== undefined) {
    throw new WorktreeDiffError('GIT_COMMAND_FAILED', message);
  }
  const value = result.stdout.trim();
  if (!/^[0-9a-f]{40,64}$/.test(value)) {
    throw new WorktreeDiffError('GIT_COMMAND_FAILED', message);
  }
  return value;
}

async function resolveCommit(repositoryRoot: string, sha: string, runGit: RunGit): Promise<string> {
  return requireCommitResult(
    await runGit([
      '-C',
      repositoryRoot,
      'rev-parse',
      '--verify',
      '--end-of-options',
      `${sha}^{commit}`,
    ]),
    'Git could not resolve the selected commit.',
  );
}

async function commitBase(repositoryRoot: string, head: string, runGit: RunGit): Promise<string> {
  const parents = await runGit(['-C', repositoryRoot, 'rev-list', '--parents', '-n', '1', head]);
  if (parents.exitCode !== 0 || parents.failureReason !== undefined) {
    throw new WorktreeDiffError(
      'GIT_COMMAND_FAILED',
      'Git could not read the selected commit parent.',
    );
  }
  const values = parents.stdout.trim().split(/\s+/u);
  if (values[0] !== head || values.some((value) => !/^[0-9a-f]{40,64}$/.test(value))) {
    throw new WorktreeDiffError(
      'GIT_COMMAND_FAILED',
      'Git could not read the selected commit parent.',
    );
  }
  if (values[1] !== undefined) {
    return values[1];
  }
  return requireCommitResult(
    await runGit(['-C', repositoryRoot, 'hash-object', '-t', 'tree', '--stdin']),
    'Git could not resolve the empty tree.',
  );
}

export async function extractWorktreeDiff(
  repositoryPath: string,
  runGit: RunGit,
  options: WorktreeDiffOptions = {},
): Promise<ChangeSet> {
  const repositoryRoot = await resolveRepositoryRoot(repositoryPath, runGit);
  const matchers = await createIgnoreMatchers(repositoryRoot, options.ignorePatterns ?? []);
  const [files, untrackedResult] = await Promise.all([
    extractTrackedFiles(repositoryRoot, runGit, ['HEAD'], matchers),
    runGit(['-C', repositoryRoot, 'ls-files', '--others', '--exclude-standard', '-z', '--']),
  ]);
  const untrackedPaths = splitNullTerminated(
    requireSuccessfulDiffCommand(untrackedResult, 'Git could not list untracked paths.'),
  );
  const trackedPaths = new Set(files.map(({ path }) => path));
  for (const path of untrackedPaths) {
    await validatePath(repositoryRoot, path);
    if (trackedPaths.has(path) || isIgnored(path, matchers)) {
      continue;
    }
    requireChangeCapacity(files.length);
    files.push(await readUntrackedFile(repositoryRoot, path));
  }

  files.sort((left, right) => left.path.localeCompare(right.path));
  return changeSetSchema.parse({
    schemaVersion: 1,
    target: { kind: 'worktree', display: 'Current worktree' },
    files,
  });
}

export async function extractCommitDiff(
  repositoryPath: string,
  sha: string,
  runGit: RunGit,
  options: WorktreeDiffOptions = {},
): Promise<ChangeSet> {
  const selected = requireCommitSha(sha);
  const repositoryRoot = await resolveRepositoryRoot(repositoryPath, runGit);
  const [head, matchers] = await Promise.all([
    resolveCommit(repositoryRoot, selected, runGit),
    createIgnoreMatchers(repositoryRoot, options.ignorePatterns ?? []),
  ]);
  const base = await commitBase(repositoryRoot, head, runGit);
  const files = await extractTrackedFiles(repositoryRoot, runGit, [base, head], matchers, true);
  files.sort((left, right) => left.path.localeCompare(right.path));
  return changeSetSchema.parse({
    schemaVersion: 1,
    target: {
      kind: 'commit_range',
      display: `Commit ${head.slice(0, 12)}`,
      base,
      head,
    },
    files,
  });
}
