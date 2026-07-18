import { createHash } from 'node:crypto';
import { basename, resolve } from 'node:path';

import {
  memorySearchInputSchema,
  type GitCommitRecord,
  type IndexResult,
  type IndexState,
  type MemorySearchInput,
  type MemorySearchResult,
  type RepositoryRecord,
  type RepositorySnapshot,
  type ReviewRunContract,
  type TrackedFileRecord,
} from '@gatekeeper/contracts';
import ignore, { type Ignore } from 'ignore';

const MAX_EXCERPT_CHARACTERS = 2_000;
const MAX_DOCUMENT_BYTES = 256 * 1_024;
const MAX_IGNORE_BYTES = 64 * 1_024;
const COMMIT_LIMIT = 200;

export type ProjectMemoryErrorCode =
  'INDEX_SOURCE_FAILED' | 'INVALID_IGNORE_FILE' | 'REPOSITORY_MISMATCH' | 'REPOSITORY_NOT_FOUND';

export class ProjectMemoryError extends Error {
  public constructor(
    public readonly code: ProjectMemoryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProjectMemoryError';
  }
}

export interface RepositoryRegistration extends RepositoryRecord {
  normalizedRoot: string;
  normalizedRemote: string | null;
}

export interface ProjectMemoryIndexedFile {
  path: string;
  objectId: string;
  mode: string;
  sizeBytes: number | null;
}

export interface ProjectMemoryIndexedCommit {
  sha: string;
  authoredAt: string;
  title: string;
  message: string;
}

export interface ProjectMemoryDocument {
  documentId: string;
  sourceType: ReviewRunContract['findings'][number]['evidence'][number]['sourceType'];
  sourceId: string;
  title: string;
  path: string | null;
  commitSha: string | null;
  excerpt: string;
  contentHash: string;
  status: MemorySearchResult['status'];
  occurredAt: string | null;
  chunkIndex: number;
}

export interface ProjectMemoryIndexBatch {
  repositoryId: string;
  head: string;
  indexedAt: string;
  files: ProjectMemoryIndexedFile[];
  documents: ProjectMemoryDocument[];
  commits: ProjectMemoryIndexedCommit[];
}

export interface ProjectMemoryPersistence {
  migrate(): void;
  registerRepository(input: RepositoryRegistration): RepositoryRecord;
  getRepository(repositoryId: string): RepositoryRecord | null;
  getRepositoryByIdentity(
    normalizedRoot: string,
    normalizedRemote: string | null,
  ): RepositoryRecord | null;
  getIndexState(repositoryId: string): IndexState | null;
  applyIndex(batch: ProjectMemoryIndexBatch): IndexResult;
  search(input: { repositoryId: string; query: string; limit?: number }): MemorySearchResult[];
  saveReview(review: ReviewRunContract): void;
  getReview(reviewId: string): ReviewRunContract | null;
  latestReviewId(repositoryId: string, target: ReviewRunContract['target']): string | null;
}

export interface ProjectMemoryGit {
  inspectRepository(repositoryPath: string): Promise<RepositorySnapshot>;
  listTrackedFiles(repositoryPath: string): Promise<TrackedFileRecord[]>;
  listCommits(repositoryPath: string, limit: number): Promise<GitCommitRecord[]>;
  readFileAtRef(repositoryPath: string, relativePath: string, ref: string): Promise<string>;
}

export interface RegisterRepositoryInput {
  root: string;
  remote: string | null;
}

export interface LocalIndexInput {
  repositoryId: string;
  ignorePatterns?: readonly string[];
}

export interface ProjectMemory {
  migrate(): Promise<void>;
  registerRepository(input: RegisterRepositoryInput): Promise<RepositoryRecord>;
  findRepository(input: RegisterRepositoryInput): Promise<RepositoryRecord | null>;
  getRepository(repositoryId: string): Promise<RepositoryRecord | null>;
  getIndexState(repositoryId: string): Promise<IndexState | null>;
  indexLocalRepository(input: LocalIndexInput): Promise<IndexResult>;
  search(input: MemorySearchInput): Promise<MemorySearchResult[]>;
  saveReview(review: ReviewRunContract): Promise<void>;
  getReview(reviewId: string): Promise<ReviewRunContract | null>;
  latestReviewId(repositoryId: string, target: ReviewRunContract['target']): Promise<string | null>;
}

interface CreateProjectMemoryOptions {
  persistence: ProjectMemoryPersistence;
  git: ProjectMemoryGit;
  now?: () => string;
}

function stripGitSuffix(value: string): string {
  return value.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
}

export function normalizeRemoteIdentity(remote: string | null): string | null {
  const value = remote?.trim();
  if (value === undefined || value.length === 0) {
    return null;
  }

  const scp = /^(?:[^@/]+@)?([^:/]+):(.+)$/.exec(value);
  if (!value.includes('://') && scp !== null) {
    const host = scp[1]?.toLowerCase();
    const rawPath = scp[2];
    if (host !== undefined && rawPath !== undefined) {
      const path = stripGitSuffix(rawPath);
      return `${host}/${host === 'github.com' ? path.toLowerCase() : path}`;
    }
  }

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const path = stripGitSuffix(url.pathname);
    return `${host}${url.port.length === 0 ? '' : `:${url.port}`}/${
      host === 'github.com' ? path.toLowerCase() : path
    }`;
  } catch {
    return stripGitSuffix(value.replaceAll('\\', '/'));
  }
}

function normalizeRootIdentity(root: string): string {
  const normalized = resolve(root).replaceAll('\\', '/').replace(/\/$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function repositoryId(identity: string): string {
  return `repository_${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
}

function documentId(
  repository: string,
  sourceType: ProjectMemoryDocument['sourceType'],
  sourceId: string,
  chunkIndex: number,
): string {
  const digest = createHash('sha256')
    .update(`${repository}\0${sourceType}\0${sourceId}\0${chunkIndex}`)
    .digest('hex')
    .slice(0, 24);
  return `document_${digest}`;
}

function isRegularFile(file: TrackedFileRecord): boolean {
  return file.mode === '100644' || file.mode === '100755';
}

function deniedSecretPath(path: string): boolean {
  const name = basename(path).toLowerCase();
  return (
    name === '.env' ||
    name.startsWith('.env.') ||
    name === '.npmrc' ||
    name === '.pypirc' ||
    name === '.netrc' ||
    name === 'credentials' ||
    name.startsWith('credentials.') ||
    name.startsWith('secrets.') ||
    name.startsWith('id_rsa') ||
    name.startsWith('id_ed25519') ||
    /\.(?:key|pem|p12|pfx)$/.test(name)
  );
}

function isSelectedDocument(path: string): boolean {
  const lower = path.toLowerCase();
  return lower === '.gatekeeper/policies.yaml' || /\.(?:md|mdx)$/.test(lower);
}

function sourceType(path: string): ProjectMemoryDocument['sourceType'] {
  const lower = path.toLowerCase();
  if (lower === '.gatekeeper/policies.yaml') {
    return 'policy';
  }
  return /(?:^|\/)adrs?(?:\/|$)/.test(lower) ? 'adr' : 'documentation';
}

function documentTitle(path: string, content: string): string {
  const heading = /^#\s+(.+)$/m.exec(content)?.[1]?.trim();
  return (heading?.length ? heading : basename(path)).slice(0, 300);
}

function documentStatus(
  type: ProjectMemoryDocument['sourceType'],
  content: string,
): MemorySearchResult['status'] {
  if (type !== 'adr') {
    return 'active';
  }
  const status = /^(?:\*\*)?status(?:\*\*)?\s*:\s*(\w+)/im.exec(content)?.[1]?.toLowerCase();
  return status === 'active' || status === 'superseded' ? status : 'unknown';
}

function chunks(content: string, shouldChunk: boolean): string[] {
  if (!shouldChunk || content.length <= MAX_EXCERPT_CHARACTERS) {
    return [content.slice(0, MAX_EXCERPT_CHARACTERS)];
  }
  const result: string[] = [];
  for (let start = 0; start < content.length; start += MAX_EXCERPT_CHARACTERS) {
    result.push(content.slice(start, start + MAX_EXCERPT_CHARACTERS));
  }
  return result;
}

function skippableDocumentError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'FILE_TOO_LARGE' || error.code === 'INVALID_FILE_CONTENT')
  );
}

async function ignoreMatcher(
  repositoryRoot: string,
  files: readonly TrackedFileRecord[],
  git: ProjectMemoryGit,
  patterns: readonly string[],
): Promise<Ignore> {
  const matcher = ignore();
  for (const path of ['.gitignore', '.gatekeeperignore']) {
    const file = files.find((candidate) => candidate.path === path);
    if (file === undefined) {
      continue;
    }
    if (!isRegularFile(file) || file.sizeBytes === null || file.sizeBytes > MAX_IGNORE_BYTES) {
      throw new ProjectMemoryError(
        'INVALID_IGNORE_FILE',
        'A repository ignore file is not a bounded regular text file.',
      );
    }
    try {
      matcher.add(await git.readFileAtRef(repositoryRoot, path, 'HEAD'));
    } catch (error) {
      throw new ProjectMemoryError(
        'INVALID_IGNORE_FILE',
        'A repository ignore file could not be read safely.',
        { cause: error },
      );
    }
  }
  matcher.add(patterns);
  return matcher;
}

async function buildDocuments(
  repository: RepositoryRecord,
  files: readonly TrackedFileRecord[],
  commits: readonly GitCommitRecord[],
  git: ProjectMemoryGit,
): Promise<ProjectMemoryDocument[]> {
  const documents: ProjectMemoryDocument[] = [];
  for (const file of files) {
    if (!isSelectedDocument(file.path)) {
      continue;
    }
    let content: string;
    try {
      content = await git.readFileAtRef(repository.root, file.path, 'HEAD');
    } catch (error) {
      if (skippableDocumentError(error)) {
        continue;
      }
      throw new ProjectMemoryError(
        'INDEX_SOURCE_FAILED',
        'Project Memory could not read a selected repository document.',
        { cause: error },
      );
    }
    const type = sourceType(file.path);
    for (const [chunkIndex, excerpt] of chunks(content, type !== 'policy').entries()) {
      documents.push({
        documentId: documentId(repository.repositoryId, type, file.path, chunkIndex),
        sourceType: type,
        sourceId: file.path,
        title: documentTitle(file.path, content),
        path: file.path,
        commitSha: null,
        excerpt,
        contentHash: file.objectId,
        status: documentStatus(type, content),
        occurredAt: null,
        chunkIndex,
      });
    }
  }

  for (const record of commits) {
    const excerpt = [record.title, record.message]
      .filter((part) => part.length > 0)
      .join('\n\n')
      .slice(0, MAX_EXCERPT_CHARACTERS);
    documents.push({
      documentId: documentId(repository.repositoryId, 'commit', record.sha, 0),
      sourceType: 'commit',
      sourceId: record.sha,
      title: record.title,
      path: null,
      commitSha: record.sha,
      excerpt,
      contentHash: record.sha,
      status: 'historical',
      occurredAt: new Date(record.authoredAt).toISOString(),
      chunkIndex: 0,
    });
  }
  return documents;
}

export function createProjectMemory(options: CreateProjectMemoryOptions): ProjectMemory {
  const now = options.now ?? (() => new Date().toISOString());

  return {
    migrate: () => {
      options.persistence.migrate();
      return Promise.resolve();
    },
    registerRepository: (input) => {
      const normalizedRoot = normalizeRootIdentity(input.root);
      const normalizedRemote = normalizeRemoteIdentity(input.remote);
      const existing = options.persistence.getRepositoryByIdentity(
        normalizedRoot,
        normalizedRemote,
      );
      const timestamp = now();
      return Promise.resolve(
        options.persistence.registerRepository({
          schemaVersion: 1,
          repositoryId: existing?.repositoryId ?? repositoryId(normalizedRemote ?? normalizedRoot),
          root: resolve(input.root),
          remote: input.remote?.trim() || null,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
          normalizedRoot,
          normalizedRemote,
        }),
      );
    },
    findRepository: (input) =>
      Promise.resolve(
        options.persistence.getRepositoryByIdentity(
          normalizeRootIdentity(input.root),
          normalizeRemoteIdentity(input.remote),
        ),
      ),
    getRepository: (id) => Promise.resolve(options.persistence.getRepository(id)),
    getIndexState: (id) => Promise.resolve(options.persistence.getIndexState(id)),
    indexLocalRepository: async (input) => {
      const repository = options.persistence.getRepository(input.repositoryId);
      if (repository === null) {
        throw new ProjectMemoryError(
          'REPOSITORY_NOT_FOUND',
          'Initialize this repository before indexing Project Memory.',
        );
      }
      const snapshot = await options.git.inspectRepository(repository.root);
      if (normalizeRootIdentity(snapshot.root) !== normalizeRootIdentity(repository.root)) {
        throw new ProjectMemoryError(
          'REPOSITORY_MISMATCH',
          'The registered repository no longer matches its Git root.',
        );
      }
      const [trackedFiles, commits] = await Promise.all([
        options.git.listTrackedFiles(repository.root),
        options.git.listCommits(repository.root, COMMIT_LIMIT),
      ]);
      const matcher = await ignoreMatcher(
        repository.root,
        trackedFiles,
        options.git,
        input.ignorePatterns ?? [],
      );
      const files = trackedFiles.filter(
        (file) =>
          isRegularFile(file) &&
          file.sizeBytes !== null &&
          file.sizeBytes <= MAX_DOCUMENT_BYTES &&
          !deniedSecretPath(file.path) &&
          !matcher.ignores(file.path),
      );
      const documents = await buildDocuments(repository, files, commits, options.git);
      return options.persistence.applyIndex({
        repositoryId: repository.repositoryId,
        head: snapshot.head,
        indexedAt: now(),
        files,
        documents,
        commits,
      });
    },
    search: (input) => {
      const parsed = memorySearchInputSchema.parse(input);
      return Promise.resolve(
        options.persistence.search({
          repositoryId: parsed.repositoryId,
          query: parsed.query,
          ...(parsed.limit === undefined ? {} : { limit: parsed.limit }),
        }),
      );
    },
    saveReview: (review) => {
      options.persistence.saveReview(review);
      return Promise.resolve();
    },
    getReview: (reviewId) => Promise.resolve(options.persistence.getReview(reviewId)),
    latestReviewId: (repository, target) =>
      Promise.resolve(options.persistence.latestReviewId(repository, target)),
  };
}
