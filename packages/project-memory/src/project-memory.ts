import { createHash } from 'node:crypto';
import { basename, resolve } from 'node:path';

import {
  memorySearchInputSchema,
  type GitCommitRecord,
  type GitHubHistoryBatch,
  type GitHubRemoteRecord,
  type GitHubSyncResult,
  type EvidenceTimelineItem,
  type IndexResult,
  type IndexState,
  type MemorySearchInput,
  type MemorySearchResult,
  type RecentCommitEvidence,
  type RepositoryRecord,
  type RepositorySnapshot,
  type ReviewOperationContract,
  type ReviewRunContract,
  type TrackedFileRecord,
} from '@gatekeeper/contracts';
import ignore, { type Ignore } from 'ignore';

const MAX_EXCERPT_CHARACTERS = 2_000;
const MAX_DOCUMENT_BYTES = 256 * 1_024;
const MAX_IGNORE_BYTES = 64 * 1_024;
const COMMIT_LIMIT = 200;
const MAX_TIMELINE_ITEMS = 50;

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

export interface CommitMemoryState {
  sha: string;
  indexed: boolean;
  reviewed: boolean;
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
  remoteUrl?: string | null;
  chunkIndex: number;
}

export interface ProjectMemoryDocumentLink {
  fromSourceType: ProjectMemoryDocument['sourceType'];
  fromSourceId: string;
  toSourceType: ProjectMemoryDocument['sourceType'];
  toSourceId: string;
  type: 'mentions' | 'implements' | 'reverts' | 'supersedes' | 'caused_by' | 'resolves';
  position: number;
}

export interface ProjectMemoryRemoteSyncBatch {
  repositoryId: string;
  provider: 'github';
  syncedAt: string;
  cursor: string | null;
  partial: boolean;
  failures: GitHubHistoryBatch['failures'];
  documents: ProjectMemoryDocument[];
  links: ProjectMemoryDocumentLink[];
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
  applyRemoteSync(batch: ProjectMemoryRemoteSyncBatch): GitHubSyncResult;
  getSyncCursor(repositoryId: string, provider: 'github'): string | null;
  recentCommits(repositoryId: string): RecentCommitEvidence[];
  commitStates(repositoryId: string, shas: readonly string[]): CommitMemoryState[];
  search(input: { repositoryId: string; query: string; limit?: number }): MemorySearchResult[];
  saveReview(review: ReviewRunContract): void;
  saveReviewOperation(operation: ReviewOperationContract): void;
  getReview(reviewId: string): ReviewRunContract | null;
  getReviewOperation(reviewId: string): ReviewOperationContract | null;
  failInterruptedReviewOperations(updatedAt: string): number;
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

export interface RemoteIndexInput {
  repositoryId: string;
  provider: 'github';
  batch: GitHubHistoryBatch;
}

export interface ProjectMemory {
  migrate(): Promise<void>;
  registerRepository(input: RegisterRepositoryInput): Promise<RepositoryRecord>;
  findRepository(input: RegisterRepositoryInput): Promise<RepositoryRecord | null>;
  getRepository(repositoryId: string): Promise<RepositoryRecord | null>;
  getIndexState(repositoryId: string): Promise<IndexState | null>;
  indexLocalRepository(input: LocalIndexInput): Promise<IndexResult>;
  indexRemoteDocuments(input: RemoteIndexInput): Promise<GitHubSyncResult>;
  getRemoteSyncCursor(repositoryId: string, provider: 'github'): Promise<string | null>;
  recentCommits(repositoryId: string): Promise<RecentCommitEvidence[]>;
  commitStates(repositoryId: string, shas: readonly string[]): Promise<CommitMemoryState[]>;
  search(input: MemorySearchInput): Promise<MemorySearchResult[]>;
  saveReview(review: ReviewRunContract): Promise<void>;
  saveReviewOperation(operation: ReviewOperationContract): Promise<void>;
  getReview(reviewId: string): Promise<ReviewRunContract | null>;
  getReviewOperation(reviewId: string): Promise<ReviewOperationContract | null>;
  failInterruptedReviewOperations(updatedAt: string): Promise<number>;
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

function safeGitHubHref(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      url.hostname.toLowerCase() === 'github.com' &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.port.length === 0
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function repositoryGitHubUrl(remote: string | null): string | undefined {
  const identity = normalizeRemoteIdentity(remote);
  const match = /^github\.com\/([a-z0-9_.-]+)\/([a-z0-9_.-]+)$/iu.exec(identity ?? '');
  return match?.[1] === undefined || match[2] === undefined
    ? undefined
    : `https://github.com/${match[1]}/${match[2]}`;
}

function safeRepositoryPath(path: string | undefined): string[] | undefined {
  if (path === undefined || /^[\\/]/u.test(path)) {
    return undefined;
  }
  const segments = path.replaceAll('\\', '/').split('/');
  return segments.length === 0 ||
    segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')
    ? undefined
    : segments;
}

function timelineRole(result: MemorySearchResult): EvidenceTimelineItem['role'] {
  if (result.match === 'exact' && result.evidence.sourceType === 'pull_request') {
    return 'revived_change';
  }
  if (result.evidence.sourceType === 'adr' || result.evidence.sourceType === 'decision') {
    return 'decision';
  }
  if (result.relationship === 'implements' && result.evidence.sourceType === 'issue') {
    return 'proposal';
  }
  if (result.relationship === 'supersedes' && result.evidence.sourceType === 'pull_request') {
    return 'implementation';
  }
  if (result.relationship === 'caused_by' && result.evidence.sourceType === 'issue') {
    return 'incident';
  }
  if (result.relationship === 'reverts' && result.evidence.sourceType === 'pull_request') {
    return 'revert';
  }
  return 'context';
}

export function buildEvidenceTimeline(input: {
  repositoryHead: string;
  repositoryRemote: string | null;
  results: readonly MemorySearchResult[];
}): EvidenceTimelineItem[] {
  const repositoryUrl = repositoryGitHubUrl(input.repositoryRemote);
  const results = input.results.some(({ match }) => match === 'exact' || match === 'linked')
    ? input.results.filter(({ match }) => match !== 'fts')
    : input.results;
  const order = new Map<EvidenceTimelineItem['role'], number>(
    [
      'proposal',
      'implementation',
      'incident',
      'revert',
      'decision',
      'revived_change',
      'context',
    ].map((role, index) => [role as EvidenceTimelineItem['role'], index]),
  );
  const seen = new Set<string>();
  return results
    .flatMap((result, position) => {
      const key = [
        result.evidence.sourceType,
        result.evidence.sourceId,
        result.evidence.path ?? '',
        result.evidence.commitSha ?? '',
      ].join('\0');
      if (seen.has(key)) {
        return [];
      }
      seen.add(key);
      const role = timelineRole(result);
      const path = safeRepositoryPath(result.evidence.path);
      const ref =
        result.evidence.commitSha !== undefined &&
        /^[0-9a-f]{40,64}$/u.test(result.evidence.commitSha)
          ? result.evidence.commitSha
          : input.repositoryHead;
      const repositoryHref =
        repositoryUrl === undefined || path === undefined || !/^[0-9a-f]{40,64}$/u.test(ref)
          ? undefined
          : `${repositoryUrl}/blob/${ref}/${path.map(encodeURIComponent).join('/')}`;
      const href = safeGitHubHref(result.evidence.remoteUrl) ?? repositoryHref;
      return [
        {
          item: {
            role,
            ...(result.relationship === undefined ? {} : { relationship: result.relationship }),
            sourceAuthority: ['issue', 'pull_request', 'comment'].includes(
              result.evidence.sourceType,
            )
              ? ('github' as const)
              : ('repository' as const),
            status:
              role === 'implementation' && result.relationship === 'supersedes'
                ? ('superseded' as const)
                : result.status,
            evidence: result.evidence,
            ...(href === undefined ? {} : { href }),
          } satisfies EvidenceTimelineItem,
          position,
        },
      ];
    })
    .sort(
      (left, right) =>
        (order.get(left.item.role) ?? order.size) - (order.get(right.item.role) ?? order.size) ||
        left.position - right.position,
    )
    .slice(0, MAX_TIMELINE_ITEMS)
    .map(({ item }) => item);
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

function remoteSourceType(kind: GitHubRemoteRecord['kind']): ProjectMemoryDocument['sourceType'] {
  if (kind === 'issue') {
    return 'issue';
  }
  if (kind === 'pull_request') {
    return 'pull_request';
  }
  return 'comment';
}

function remoteStatus(record: GitHubRemoteRecord): MemorySearchResult['status'] {
  if (record.kind === 'issue' || record.kind === 'pull_request') {
    return record.state.toLowerCase() === 'open' ? 'active' : 'historical';
  }
  return 'historical';
}

function sourceTypeFromId(sourceId: string): ProjectMemoryDocument['sourceType'] | undefined {
  if (sourceId.startsWith('issue:')) {
    return 'issue';
  }
  if (sourceId.startsWith('pull_request:')) {
    return 'pull_request';
  }
  if (sourceId.startsWith('comment:')) {
    return 'comment';
  }
  return undefined;
}

function linkKey(link: ProjectMemoryDocumentLink): string {
  return [
    link.fromSourceType,
    link.fromSourceId,
    link.toSourceType,
    link.toSourceId,
    link.type,
  ].join('\0');
}

function extractRemoteLinks(records: readonly GitHubRemoteRecord[]): ProjectMemoryDocumentLink[] {
  const links = new Map<string, ProjectMemoryDocumentLink>();
  const numberKinds = new Map<number, 'issue' | 'pull_request'>();
  for (const record of records) {
    if (
      record.number !== undefined &&
      record.number !== null &&
      (record.kind === 'issue' || record.kind === 'pull_request')
    ) {
      numberKinds.set(record.number, record.kind);
    }
  }

  for (const record of records) {
    const fromSourceType = remoteSourceType(record.kind);
    let position = 0;
    const add = (
      type: ProjectMemoryDocumentLink['type'],
      toSourceType: ProjectMemoryDocument['sourceType'],
      toSourceId: string,
    ) => {
      const link = {
        fromSourceType,
        fromSourceId: record.sourceId,
        toSourceType,
        toSourceId,
        type,
        position,
      } satisfies ProjectMemoryDocumentLink;
      position += 1;
      if (toSourceId !== record.sourceId && !links.has(linkKey(link))) {
        links.set(linkKey(link), link);
      }
    };

    if (record.parentSourceId !== null) {
      const parentType = sourceTypeFromId(record.parentSourceId);
      if (parentType !== undefined) {
        add('mentions', parentType, record.parentSourceId);
      }
    }

    const markerPattern =
      /^Gatekeeper-Relation:\s*(mentions|implements|reverts|supersedes|caused_by|resolves)\s+(issue|pull_request|adr)\s+([^\s]+)\s*$/gimu;
    for (const match of record.body.matchAll(markerPattern)) {
      const type = match[1] as ProjectMemoryDocumentLink['type'];
      const targetKind = match[2];
      const target = match[3];
      if (targetKind === undefined || target === undefined) {
        continue;
      }
      if ((targetKind === 'issue' || targetKind === 'pull_request') && /^#\d+$/.test(target)) {
        add(type, targetKind, `${targetKind}:${target}`);
      } else if (targetKind === 'adr' && target.length <= 300 && !target.includes('..')) {
        add(type, 'adr', target.replaceAll('\\', '/'));
      }
    }

    for (const match of record.body.matchAll(/#(\d{1,10})\b/gu)) {
      const number = Number(match[1]);
      if (!Number.isSafeInteger(number) || number <= 0) {
        continue;
      }
      const context = record.body.slice(Math.max(0, (match.index ?? 0) - 50), match.index);
      const lowerContext = context.toLowerCase();
      if (/revert(?:s|ed|ing)?\s*$/u.test(lowerContext)) {
        add('reverts', 'pull_request', `pull_request:#${number}`);
      } else if (/(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*$/u.test(lowerContext)) {
        add('resolves', 'issue', `issue:#${number}`);
      } else {
        const targetKind = numberKinds.get(number) ?? 'issue';
        add('mentions', targetKind, `${targetKind}:#${number}`);
      }
    }
  }
  return [...links.values()];
}

export function normalizeGitHubHistory(
  repository: string,
  batch: GitHubHistoryBatch,
): { documents: ProjectMemoryDocument[]; links: ProjectMemoryDocumentLink[] } {
  const documents = batch.records.map((record) => {
    const type = remoteSourceType(record.kind);
    const contentHash = createHash('sha256')
      .update(
        JSON.stringify([
          record.kind,
          record.sourceId,
          record.title,
          record.body,
          record.url,
          record.state,
          record.createdAt,
          record.updatedAt,
        ]),
      )
      .digest('hex');
    return {
      documentId: documentId(repository, type, record.sourceId, 0),
      sourceType: type,
      sourceId: record.sourceId,
      title: record.title,
      path: null,
      commitSha: null,
      excerpt: record.body.slice(0, MAX_EXCERPT_CHARACTERS),
      contentHash,
      status: remoteStatus(record),
      occurredAt: record.updatedAt,
      remoteUrl: record.url,
      chunkIndex: 0,
    } satisfies ProjectMemoryDocument;
  });
  return { documents, links: extractRemoteLinks(batch.records) };
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
      if (
        existing !== null &&
        normalizeRootIdentity(existing.root) === normalizedRoot &&
        normalizeRemoteIdentity(existing.remote) !== normalizedRemote
      ) {
        return Promise.reject(
          new ProjectMemoryError(
            'REPOSITORY_MISMATCH',
            'The repository remote changed at this local root. Start with the original repository or repair local Project Memory explicitly.',
          ),
        );
      }
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
    getRemoteSyncCursor: (id, provider) =>
      Promise.resolve(options.persistence.getSyncCursor(id, provider)),
    recentCommits: (id) => Promise.resolve(options.persistence.recentCommits(id)),
    commitStates: (id, shas) => Promise.resolve(options.persistence.commitStates(id, shas)),
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
      if (normalizeRemoteIdentity(snapshot.remote) !== normalizeRemoteIdentity(repository.remote)) {
        throw new ProjectMemoryError(
          'REPOSITORY_MISMATCH',
          'The registered repository remote changed. Restart Gatekeeper only after explicitly repairing local Project Memory.',
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
    indexRemoteDocuments: (input) => {
      const repository = options.persistence.getRepository(input.repositoryId);
      if (repository === null) {
        throw new ProjectMemoryError(
          'REPOSITORY_NOT_FOUND',
          'Initialize this repository before synchronizing GitHub history.',
        );
      }
      const normalized = normalizeGitHubHistory(repository.repositoryId, input.batch);
      return Promise.resolve(
        options.persistence.applyRemoteSync({
          repositoryId: repository.repositoryId,
          provider: input.provider,
          syncedAt: now(),
          cursor: input.batch.cursor,
          partial: input.batch.partial,
          failures: input.batch.failures,
          documents: normalized.documents,
          links: normalized.links,
        }),
      );
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
    saveReviewOperation: (operation) => {
      options.persistence.saveReviewOperation(operation);
      return Promise.resolve();
    },
    getReview: (reviewId) => Promise.resolve(options.persistence.getReview(reviewId)),
    getReviewOperation: (reviewId) =>
      Promise.resolve(options.persistence.getReviewOperation(reviewId)),
    failInterruptedReviewOperations: (updatedAt) =>
      Promise.resolve(options.persistence.failInterruptedReviewOperations(updatedAt)),
    latestReviewId: (repository, target) =>
      Promise.resolve(options.persistence.latestReviewId(repository, target)),
  };
}
