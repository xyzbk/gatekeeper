import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  githubSyncResultSchema,
  indexResultSchema,
  indexStateSchema,
  memorySearchInputSchema,
  memorySearchResultSchema,
  repositoryRecordSchema,
  reviewRunSchema,
  type IndexResult,
  type IndexState,
  type GitHubHistoryFailure,
  type GitHubSyncResult,
  type MemorySearchResult,
  type RepositoryRecord,
  type ReviewRunContract,
} from '@gatekeeper/contracts';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const DEFAULT_MIGRATIONS_FOLDER = fileURLToPath(new URL('../drizzle', import.meta.url));
const TRUST_LABEL = 'untrusted_repository_content' as const;

export type SqliteProjectStoreErrorCode =
  | 'CORRUPT_DATA'
  | 'DATABASE_OPEN_FAILED'
  | 'FTS5_UNAVAILABLE'
  | 'INVALID_INDEX_BATCH'
  | 'INVALID_REMOTE_BATCH'
  | 'INDEX_WRITE_FAILED'
  | 'MIGRATION_FAILED'
  | 'REVIEW_WRITE_FAILED'
  | 'REMOTE_SYNC_WRITE_FAILED'
  | 'REPOSITORY_CONFLICT';

export class SqliteProjectStoreError extends Error {
  public constructor(
    public readonly code: SqliteProjectStoreErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SqliteProjectStoreError';
  }
}

export interface RepositoryRegistration extends RepositoryRecord {
  normalizedRoot: string;
  normalizedRemote: string | null;
}

export interface SqliteIndexedFile {
  path: string;
  objectId: string;
  mode: string;
  sizeBytes: number | null;
}

export interface SqliteIndexedCommit {
  sha: string;
  authoredAt: string;
  title: string;
  message: string;
}

export interface SqliteMemoryDocument {
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

export interface SqliteDocumentLink {
  fromSourceType: SqliteMemoryDocument['sourceType'];
  fromSourceId: string;
  toSourceType: SqliteMemoryDocument['sourceType'];
  toSourceId: string;
  type: 'mentions' | 'implements' | 'reverts' | 'supersedes' | 'caused_by' | 'resolves';
  position: number;
}

export interface SqliteRemoteSyncBatch {
  repositoryId: string;
  provider: 'github';
  syncedAt: string;
  cursor: string | null;
  partial: boolean;
  failures: GitHubHistoryFailure[];
  documents: SqliteMemoryDocument[];
  links: SqliteDocumentLink[];
}

export interface SqliteIndexBatch {
  repositoryId: string;
  head: string;
  indexedAt: string;
  files: SqliteIndexedFile[];
  documents: SqliteMemoryDocument[];
  commits: SqliteIndexedCommit[];
}

type FileRow = SqliteIndexedFile;

type CommitRow = SqliteIndexedCommit;

interface DocumentRow extends SqliteMemoryDocument {
  rowid: number;
  remoteUrl: string | null;
}

interface SearchRow {
  documentId: string;
  sourceType: string;
  sourceId: string;
  title: string;
  path: string | null;
  commitSha: string | null;
  excerpt: string;
  contentHash: string;
  status: string;
  occurredAt: string | null;
  remoteUrl: string | null;
}

interface LinkedSearchRow extends SearchRow {
  position: number;
}

interface RepositoryRow {
  id: string;
  root: string;
  remote: string | null;
  createdAt: string;
  updatedAt: string;
}

function uniqueBy<T>(
  values: readonly T[],
  key: (value: T) => string,
  label: string,
  code: 'INVALID_INDEX_BATCH' | 'INVALID_REMOTE_BATCH' = 'INVALID_INDEX_BATCH',
): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const id = key(value);
    if (result.has(id)) {
      throw new SqliteProjectStoreError(
        code,
        `Project Memory received duplicate ${label} records.`,
      );
    }
    result.set(id, value);
  }
  return result;
}

function sameFile(left: FileRow, right: SqliteIndexedFile): boolean {
  return (
    left.objectId === right.objectId &&
    left.mode === right.mode &&
    left.sizeBytes === right.sizeBytes
  );
}

function sameCommit(left: CommitRow, right: SqliteIndexedCommit): boolean {
  return (
    left.authoredAt === right.authoredAt &&
    left.title === right.title &&
    left.message === right.message
  );
}

function sameDocument(left: DocumentRow, right: SqliteMemoryDocument): boolean {
  return (
    left.sourceType === right.sourceType &&
    left.sourceId === right.sourceId &&
    left.title === right.title &&
    left.path === right.path &&
    left.commitSha === right.commitSha &&
    left.excerpt === right.excerpt &&
    left.contentHash === right.contentHash &&
    left.status === right.status &&
    left.occurredAt === right.occurredAt &&
    left.remoteUrl === (right.remoteUrl ?? null) &&
    left.chunkIndex === right.chunkIndex
  );
}

function ftsQuery(query: string): string | undefined {
  const tokens = query.match(/[\p{L}\p{N}_-]+/gu)?.slice(0, 20);
  return tokens === undefined || tokens.length === 0
    ? undefined
    : tokens.map((token) => `"${token}"`).join(' AND ');
}

function repositoryRecord(row: RepositoryRow): RepositoryRecord {
  return repositoryRecordSchema.parse({
    schemaVersion: 1,
    repositoryId: row.id,
    root: row.root,
    remote: row.remote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function searchResult(repositoryId: string, row: SearchRow, match: MemorySearchResult['match']) {
  return memorySearchResultSchema.parse({
    documentId: row.documentId,
    match,
    trust: TRUST_LABEL,
    status: row.status,
    occurredAt: row.occurredAt,
    evidence: {
      sourceType: row.sourceType,
      repositoryId,
      sourceId: row.sourceId,
      title: row.title,
      ...(row.path === null ? {} : { path: row.path }),
      ...(row.commitSha === null ? {} : { commitSha: row.commitSha }),
      ...(row.remoteUrl === null ? {} : { remoteUrl: row.remoteUrl }),
      excerpt: row.excerpt,
      contentHash: row.contentHash,
    },
  });
}

function verifyFts5(database: Database.Database): void {
  try {
    database.exec(
      'CREATE VIRTUAL TABLE temp.gatekeeper_fts5_check USING fts5(value); DROP TABLE temp.gatekeeper_fts5_check;',
    );
  } catch (error) {
    throw new SqliteProjectStoreError(
      'FTS5_UNAVAILABLE',
      'SQLite FTS5 is unavailable. Reinstall Gatekeeper with its supported SQLite build.',
      { cause: error },
    );
  }
}

export class SqliteProjectStore {
  readonly #database: Database.Database;
  readonly #migrationsFolder: string;
  #closed = false;

  public constructor(database: Database.Database, migrationsFolder: string) {
    this.#database = database;
    this.#migrationsFolder = migrationsFolder;
  }

  public migrate(): void {
    verifyFts5(this.#database);
    try {
      migrate(drizzle({ client: this.#database }), { migrationsFolder: this.#migrationsFolder });
    } catch (error) {
      throw new SqliteProjectStoreError(
        'MIGRATION_FAILED',
        'Project Memory migrations failed. Reinstall Gatekeeper or repair the local database.',
        { cause: error },
      );
    }
  }

  public capabilities(): { foreignKeys: boolean; fts5: boolean; journalMode: string } {
    verifyFts5(this.#database);
    return {
      foreignKeys: this.#database.pragma('foreign_keys', { simple: true }) === 1,
      fts5: true,
      journalMode: String(this.#database.pragma('journal_mode', { simple: true })).toLowerCase(),
    };
  }

  public registerRepository(input: RepositoryRegistration): RepositoryRecord {
    const { normalizedRemote, normalizedRoot, ...record } = input;
    const parsed = repositoryRecordSchema.parse(record);
    try {
      this.#database
        .prepare(
          `INSERT INTO repositories (
             id, root, normalized_root, remote, normalized_remote, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             root = excluded.root,
             normalized_root = excluded.normalized_root,
             remote = excluded.remote,
             normalized_remote = excluded.normalized_remote,
             updated_at = excluded.updated_at`,
        )
        .run(
          parsed.repositoryId,
          parsed.root,
          normalizedRoot,
          parsed.remote,
          normalizedRemote,
          parsed.createdAt,
          parsed.updatedAt,
        );
    } catch (error) {
      throw new SqliteProjectStoreError(
        'REPOSITORY_CONFLICT',
        'Project Memory already contains a conflicting repository identity.',
        { cause: error },
      );
    }
    return parsed;
  }

  public getRepository(repositoryId: string): RepositoryRecord | null {
    const row = this.#database
      .prepare<unknown[], RepositoryRow>(
        `SELECT id, root, remote, created_at AS createdAt, updated_at AS updatedAt
         FROM repositories WHERE id = ?`,
      )
      .get(repositoryId);
    return row === undefined ? null : repositoryRecord(row);
  }

  public getRepositoryByIdentity(
    normalizedRoot: string,
    normalizedRemote: string | null,
  ): RepositoryRecord | null {
    const row = this.#database
      .prepare<unknown[], RepositoryRow>(
        `SELECT id, root, remote, created_at AS createdAt, updated_at AS updatedAt
         FROM repositories
         WHERE normalized_root = ? OR (? IS NOT NULL AND normalized_remote = ?)
         ORDER BY CASE WHEN normalized_remote = ? THEN 0 ELSE 1 END
         LIMIT 1`,
      )
      .get(normalizedRoot, normalizedRemote, normalizedRemote, normalizedRemote);
    return row === undefined ? null : repositoryRecord(row);
  }

  public getIndexState(repositoryId: string): IndexState | null {
    const row = this.#database
      .prepare<
        unknown[],
        {
          repositoryId: string;
          head: string;
          indexedAt: string;
          files: number;
          documents: number;
          commits: number;
        }
      >(
        `SELECT repository_id AS repositoryId, head, indexed_at AS indexedAt,
                file_count AS files, document_count AS documents, commit_count AS commits
         FROM index_state WHERE repository_id = ?`,
      )
      .get(repositoryId);
    return row === undefined ? null : indexStateSchema.parse({ schemaVersion: 1, ...row });
  }

  public applyIndex(batch: SqliteIndexBatch): IndexResult {
    const incomingFiles = uniqueBy(batch.files, ({ path }) => path, 'file');
    const incomingDocuments = uniqueBy(batch.documents, ({ documentId }) => documentId, 'document');
    const incomingCommits = uniqueBy(batch.commits, ({ sha }) => sha, 'commit');

    const apply = this.#database.transaction(() => {
      const existingFiles = new Map(
        this.#database
          .prepare<unknown[], FileRow>(
            `SELECT path, object_id AS objectId, mode, size_bytes AS sizeBytes
             FROM files WHERE repository_id = ?`,
          )
          .all(batch.repositoryId)
          .map((row) => [row.path, row]),
      );
      let filesWritten = 0;
      for (const file of incomingFiles.values()) {
        const current = existingFiles.get(file.path);
        if (current !== undefined && sameFile(current, file)) {
          continue;
        }
        this.#database
          .prepare(
            `INSERT INTO files (repository_id, path, object_id, mode, size_bytes, indexed_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(repository_id, path) DO UPDATE SET
               object_id = excluded.object_id,
               mode = excluded.mode,
               size_bytes = excluded.size_bytes,
               indexed_at = excluded.indexed_at`,
          )
          .run(
            batch.repositoryId,
            file.path,
            file.objectId,
            file.mode,
            file.sizeBytes,
            batch.indexedAt,
          );
        filesWritten += 1;
      }
      let filesDeleted = 0;
      for (const path of existingFiles.keys()) {
        if (!incomingFiles.has(path)) {
          this.#database
            .prepare('DELETE FROM files WHERE repository_id = ? AND path = ?')
            .run(batch.repositoryId, path);
          filesDeleted += 1;
        }
      }

      const existingDocuments = new Map(
        this.#database
          .prepare<unknown[], DocumentRow>(
            `SELECT rowid, id AS documentId, source_type AS sourceType, source_id AS sourceId,
                    title, path, commit_sha AS commitSha, excerpt, content_hash AS contentHash,
                    status, occurred_at AS occurredAt, remote_url AS remoteUrl,
                    chunk_index AS chunkIndex
             FROM documents
             WHERE repository_id = ?
               AND source_type IN ('adr', 'documentation', 'policy', 'commit')`,
          )
          .all(batch.repositoryId)
          .map((row) => [row.documentId, row]),
      );
      let documentsWritten = 0;
      for (const document of incomingDocuments.values()) {
        const current = existingDocuments.get(document.documentId);
        if (current !== undefined && sameDocument(current, document)) {
          continue;
        }
        const write = this.#database
          .prepare(
            `INSERT INTO documents (
               id, repository_id, source_type, source_id, title, path, commit_sha, excerpt,
               content_hash, status, occurred_at, remote_url, chunk_index, indexed_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               source_type = excluded.source_type,
               source_id = excluded.source_id,
               title = excluded.title,
               path = excluded.path,
               commit_sha = excluded.commit_sha,
               excerpt = excluded.excerpt,
               content_hash = excluded.content_hash,
               status = excluded.status,
               occurred_at = excluded.occurred_at,
               remote_url = excluded.remote_url,
               chunk_index = excluded.chunk_index,
               indexed_at = excluded.indexed_at
             WHERE documents.repository_id = excluded.repository_id`,
          )
          .run(
            document.documentId,
            batch.repositoryId,
            document.sourceType,
            document.sourceId,
            document.title,
            document.path,
            document.commitSha,
            document.excerpt,
            document.contentHash,
            document.status,
            document.occurredAt,
            document.remoteUrl ?? null,
            document.chunkIndex,
            batch.indexedAt,
          );
        if (write.changes !== 1) {
          throw new SqliteProjectStoreError(
            'INVALID_INDEX_BATCH',
            'Project Memory received a document identity owned by another repository.',
          );
        }
        documentsWritten += 1;
      }
      let documentsDeleted = 0;
      for (const documentId of existingDocuments.keys()) {
        if (!incomingDocuments.has(documentId)) {
          this.#database
            .prepare('DELETE FROM documents WHERE repository_id = ? AND id = ?')
            .run(batch.repositoryId, documentId);
          documentsDeleted += 1;
        }
      }

      const existingCommits = new Map(
        this.#database
          .prepare<unknown[], CommitRow>(
            `SELECT sha, authored_at AS authoredAt, title, message
             FROM commits WHERE repository_id = ?`,
          )
          .all(batch.repositoryId)
          .map((row) => [row.sha, row]),
      );
      let commitsWritten = 0;
      for (const commit of incomingCommits.values()) {
        const current = existingCommits.get(commit.sha);
        if (current !== undefined && sameCommit(current, commit)) {
          continue;
        }
        this.#database
          .prepare(
            `INSERT INTO commits (repository_id, sha, authored_at, title, message, indexed_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(repository_id, sha) DO UPDATE SET
               authored_at = excluded.authored_at,
               title = excluded.title,
               message = excluded.message,
               indexed_at = excluded.indexed_at`,
          )
          .run(
            batch.repositoryId,
            commit.sha,
            commit.authoredAt,
            commit.title,
            commit.message,
            batch.indexedAt,
          );
        commitsWritten += 1;
      }
      let commitsDeleted = 0;
      for (const sha of existingCommits.keys()) {
        if (!incomingCommits.has(sha)) {
          this.#database
            .prepare('DELETE FROM commits WHERE repository_id = ? AND sha = ?')
            .run(batch.repositoryId, sha);
          commitsDeleted += 1;
        }
      }

      this.#database
        .prepare(
          `INSERT INTO index_state (
             repository_id, head, indexed_at, file_count, document_count, commit_count
           ) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(repository_id) DO UPDATE SET
             head = excluded.head,
             indexed_at = excluded.indexed_at,
             file_count = excluded.file_count,
             document_count = excluded.document_count,
             commit_count = excluded.commit_count`,
        )
        .run(
          batch.repositoryId,
          batch.head,
          batch.indexedAt,
          incomingFiles.size,
          incomingDocuments.size,
          incomingCommits.size,
        );

      return indexResultSchema.parse({
        schemaVersion: 1,
        repositoryId: batch.repositoryId,
        head: batch.head,
        indexedAt: batch.indexedAt,
        files: {
          scanned: incomingFiles.size,
          written: filesWritten,
          unchanged: incomingFiles.size - filesWritten,
          deleted: filesDeleted,
        },
        documents: {
          scanned: incomingDocuments.size,
          written: documentsWritten,
          unchanged: incomingDocuments.size - documentsWritten,
          deleted: documentsDeleted,
        },
        commits: {
          scanned: incomingCommits.size,
          written: commitsWritten,
          unchanged: incomingCommits.size - commitsWritten,
          deleted: commitsDeleted,
        },
      });
    });

    try {
      return apply.immediate();
    } catch (error) {
      if (error instanceof SqliteProjectStoreError) {
        throw error;
      }
      throw new SqliteProjectStoreError(
        'INDEX_WRITE_FAILED',
        'Project Memory could not write the index transaction.',
        { cause: error },
      );
    }
  }

  public getSyncCursor(repositoryId: string, provider: 'github'): string | null {
    const row = this.#database
      .prepare<unknown[], { cursor: string }>(
        'SELECT cursor FROM sync_cursors WHERE repository_id = ? AND provider = ?',
      )
      .get(repositoryId, provider);
    return row?.cursor ?? null;
  }

  public applyRemoteSync(batch: SqliteRemoteSyncBatch): GitHubSyncResult {
    const incomingDocuments = uniqueBy(
      batch.documents,
      ({ documentId }) => documentId,
      'remote document',
      'INVALID_REMOTE_BATCH',
    );
    const incomingLinks = uniqueBy(
      batch.links,
      (link) =>
        [
          link.fromSourceType,
          link.fromSourceId,
          link.toSourceType,
          link.toSourceId,
          link.type,
        ].join('\0'),
      'remote relationship',
      'INVALID_REMOTE_BATCH',
    );

    const apply = this.#database.transaction(() => {
      let documentsWritten = 0;
      let documentsUnchanged = 0;
      for (const document of incomingDocuments.values()) {
        const current = this.#database
          .prepare<unknown[], DocumentRow>(
            `SELECT rowid, id AS documentId, source_type AS sourceType,
                    source_id AS sourceId, title, path, commit_sha AS commitSha,
                    excerpt, content_hash AS contentHash, status,
                    occurred_at AS occurredAt, remote_url AS remoteUrl,
                    chunk_index AS chunkIndex
             FROM documents WHERE repository_id = ? AND id = ?`,
          )
          .get(batch.repositoryId, document.documentId);
        if (
          current?.occurredAt !== null &&
          current?.occurredAt !== undefined &&
          document.occurredAt !== null &&
          document.occurredAt < current.occurredAt
        ) {
          documentsUnchanged += 1;
          continue;
        }
        if (current !== undefined && sameDocument(current, document)) {
          documentsUnchanged += 1;
          continue;
        }
        const write = this.#database
          .prepare(
            `INSERT INTO documents (
               id, repository_id, source_type, source_id, title, path, commit_sha, excerpt,
               content_hash, status, occurred_at, remote_url, chunk_index, indexed_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               source_type = excluded.source_type,
               source_id = excluded.source_id,
               title = excluded.title,
               path = excluded.path,
               commit_sha = excluded.commit_sha,
               excerpt = excluded.excerpt,
               content_hash = excluded.content_hash,
               status = excluded.status,
               occurred_at = excluded.occurred_at,
               remote_url = excluded.remote_url,
               chunk_index = excluded.chunk_index,
               indexed_at = excluded.indexed_at
             WHERE documents.repository_id = excluded.repository_id`,
          )
          .run(
            document.documentId,
            batch.repositoryId,
            document.sourceType,
            document.sourceId,
            document.title,
            document.path,
            document.commitSha,
            document.excerpt,
            document.contentHash,
            document.status,
            document.occurredAt,
            document.remoteUrl ?? null,
            document.chunkIndex,
            batch.syncedAt,
          );
        if (write.changes !== 1) {
          throw new SqliteProjectStoreError(
            'INVALID_REMOTE_BATCH',
            'Project Memory received a remote document identity owned by another repository.',
          );
        }
        documentsWritten += 1;
      }

      const findDocument = this.#database.prepare<unknown[], { id: string }>(
        `SELECT id FROM documents
         WHERE repository_id = ? AND source_type = ? AND source_id = ?
         ORDER BY chunk_index, id LIMIT 1`,
      );
      let linksWritten = 0;
      let linksUnchanged = 0;
      for (const link of incomingLinks.values()) {
        const from = findDocument.get(batch.repositoryId, link.fromSourceType, link.fromSourceId);
        const to = findDocument.get(batch.repositoryId, link.toSourceType, link.toSourceId);
        if (from === undefined || to === undefined || from.id === to.id) {
          continue;
        }
        const current = this.#database
          .prepare<unknown[], { position: number }>(
            `SELECT position FROM document_links
             WHERE repository_id = ? AND from_document_id = ? AND to_document_id = ? AND type = ?`,
          )
          .get(batch.repositoryId, from.id, to.id, link.type);
        if (current?.position === link.position) {
          linksUnchanged += 1;
          continue;
        }
        this.#database
          .prepare(
            `INSERT INTO document_links (
               repository_id, from_document_id, to_document_id, type, position
             ) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(repository_id, from_document_id, to_document_id, type)
             DO UPDATE SET position = excluded.position`,
          )
          .run(batch.repositoryId, from.id, to.id, link.type, link.position);
        linksWritten += 1;
      }

      if (!batch.partial && batch.cursor !== null) {
        this.#database
          .prepare(
            `INSERT INTO sync_cursors (repository_id, provider, cursor, synced_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(repository_id, provider) DO UPDATE SET
               cursor = CASE
                 WHEN excluded.cursor > sync_cursors.cursor THEN excluded.cursor
                 ELSE sync_cursors.cursor
               END,
               synced_at = CASE
                 WHEN excluded.cursor > sync_cursors.cursor THEN excluded.synced_at
                 ELSE sync_cursors.synced_at
               END`,
          )
          .run(batch.repositoryId, batch.provider, batch.cursor, batch.syncedAt);
      }

      return githubSyncResultSchema.parse({
        schemaVersion: 1,
        repositoryId: batch.repositoryId,
        provider: batch.provider,
        syncedAt: batch.syncedAt,
        cursor: this.getSyncCursor(batch.repositoryId, batch.provider),
        partial: batch.partial,
        documents: {
          received: incomingDocuments.size,
          written: documentsWritten,
          unchanged: documentsUnchanged,
        },
        links: {
          received: incomingLinks.size,
          written: linksWritten,
          unchanged: linksUnchanged,
        },
        failures: batch.failures,
      });
    });

    try {
      return apply.immediate();
    } catch (error) {
      if (error instanceof SqliteProjectStoreError) {
        throw error;
      }
      throw new SqliteProjectStoreError(
        'REMOTE_SYNC_WRITE_FAILED',
        'Project Memory could not write the remote synchronization transaction.',
        { cause: error },
      );
    }
  }

  public search(input: {
    repositoryId: string;
    query: string;
    limit?: number;
  }): MemorySearchResult[] {
    const parsed = memorySearchInputSchema.parse({ schemaVersion: 1, ...input });
    const limit = parsed.limit ?? 20;
    const exactRows = this.#database
      .prepare<unknown[], SearchRow>(
        `SELECT id AS documentId, source_type AS sourceType, source_id AS sourceId,
                title, path, commit_sha AS commitSha, excerpt, content_hash AS contentHash,
                status, occurred_at AS occurredAt, remote_url AS remoteUrl
         FROM documents
         WHERE repository_id = ?
           AND (source_id = ? COLLATE NOCASE OR path = ? COLLATE NOCASE OR title = ? COLLATE NOCASE)
         ORDER BY CASE
           WHEN source_id = ? COLLATE NOCASE THEN 0
           WHEN path = ? COLLATE NOCASE THEN 1
           ELSE 2
         END, id
         LIMIT ?`,
      )
      .all(
        parsed.repositoryId,
        parsed.query,
        parsed.query,
        parsed.query,
        parsed.query,
        parsed.query,
        limit,
      );
    const results = exactRows.map((row) => searchResult(parsed.repositoryId, row, 'exact'));
    const seen = new Set(results.map(({ documentId }) => documentId));

    for (const exact of exactRows) {
      if (results.length >= limit) {
        break;
      }
      const linkedRows = this.#database
        .prepare<unknown[], LinkedSearchRow>(
          `SELECT d.id AS documentId, d.source_type AS sourceType, d.source_id AS sourceId,
                  d.title, d.path, d.commit_sha AS commitSha, d.excerpt,
                  d.content_hash AS contentHash, d.status, d.occurred_at AS occurredAt,
                  d.remote_url AS remoteUrl, l.position
           FROM document_links AS l
           JOIN documents AS d ON d.id = l.to_document_id
           WHERE l.repository_id = ? AND l.from_document_id = ?
           ORDER BY l.position, d.id`,
        )
        .all(parsed.repositoryId, exact.documentId);
      for (const row of linkedRows) {
        if (!seen.has(row.documentId)) {
          results.push(searchResult(parsed.repositoryId, row, 'linked'));
          seen.add(row.documentId);
          if (results.length === limit) {
            break;
          }
        }
      }
    }

    const matchExpression = ftsQuery(parsed.query);
    if (results.length < limit && matchExpression !== undefined) {
      const lexicalRows = this.#database
        .prepare<unknown[], SearchRow>(
          `SELECT d.id AS documentId, d.source_type AS sourceType, d.source_id AS sourceId,
                  d.title, d.path, d.commit_sha AS commitSha, d.excerpt,
                  d.content_hash AS contentHash, d.status, d.occurred_at AS occurredAt,
                  d.remote_url AS remoteUrl
           FROM document_fts
           JOIN documents AS d ON d.rowid = document_fts.rowid
           WHERE document_fts MATCH ? AND d.repository_id = ?
           ORDER BY bm25(document_fts, 6.0, 1.0, 4.0, 2.0), d.id
           LIMIT ?`,
        )
        .all(matchExpression, parsed.repositoryId, limit);
      for (const row of lexicalRows) {
        if (!seen.has(row.documentId)) {
          results.push(searchResult(parsed.repositoryId, row, 'fts'));
          seen.add(row.documentId);
          if (results.length === limit) {
            break;
          }
        }
      }
    }
    return results;
  }

  public saveReview(review: ReviewRunContract): void {
    const parsed = reviewRunSchema.parse(review);
    const save = this.#database.transaction(() => {
      const write = this.#database
        .prepare(
          `INSERT INTO review_runs (
             review_id, repository_id, target_kind, target_display, verdict, summary,
             created_at, previous_review_id, review_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(review_id) DO UPDATE SET
             repository_id = excluded.repository_id,
             target_kind = excluded.target_kind,
             target_display = excluded.target_display,
             verdict = excluded.verdict,
             summary = excluded.summary,
             created_at = excluded.created_at,
             previous_review_id = excluded.previous_review_id,
             review_json = excluded.review_json
           WHERE review_runs.repository_id = excluded.repository_id`,
        )
        .run(
          parsed.reviewId,
          parsed.repositoryId,
          parsed.target.kind,
          parsed.target.display,
          parsed.verdict,
          parsed.summary,
          parsed.createdAt,
          parsed.previousReviewId ?? null,
          JSON.stringify(parsed),
        );
      if (write.changes !== 1) {
        throw new SqliteProjectStoreError(
          'REVIEW_WRITE_FAILED',
          'Project Memory could not persist the review transaction.',
        );
      }
      this.#database.prepare('DELETE FROM findings WHERE review_id = ?').run(parsed.reviewId);
      for (const finding of parsed.findings) {
        this.#database
          .prepare(
            `INSERT INTO findings (
               review_id, finding_id, authority, severity, category, finding_json
             ) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            parsed.reviewId,
            finding.id,
            finding.authority,
            finding.severity,
            finding.category,
            JSON.stringify(finding),
          );
        for (const [position, evidence] of finding.evidence.entries()) {
          this.#database
            .prepare(
              `INSERT INTO finding_evidence (review_id, finding_id, position, evidence_json)
               VALUES (?, ?, ?, ?)`,
            )
            .run(parsed.reviewId, finding.id, position, JSON.stringify(evidence));
        }
      }
    });
    try {
      save.immediate();
    } catch (error) {
      if (error instanceof SqliteProjectStoreError) {
        throw error;
      }
      throw new SqliteProjectStoreError(
        'REVIEW_WRITE_FAILED',
        'Project Memory could not persist the review transaction.',
        { cause: error },
      );
    }
  }

  public getReview(reviewId: string): ReviewRunContract | null {
    const row = this.#database
      .prepare<unknown[], { reviewJson: string }>(
        'SELECT review_json AS reviewJson FROM review_runs WHERE review_id = ?',
      )
      .get(reviewId);
    if (row === undefined) {
      return null;
    }
    try {
      return reviewRunSchema.parse(JSON.parse(row.reviewJson));
    } catch (error) {
      throw new SqliteProjectStoreError(
        'CORRUPT_DATA',
        'The stored review is corrupt and cannot be read safely.',
        { cause: error },
      );
    }
  }

  public latestReviewId(repositoryId: string, target: ReviewRunContract['target']): string | null {
    const row = this.#database
      .prepare<unknown[], { reviewId: string }>(
        `SELECT review_id AS reviewId FROM review_runs
         WHERE repository_id = ? AND target_kind = ? AND target_display = ?
         ORDER BY created_at DESC, rowid DESC LIMIT 1`,
      )
      .get(repositoryId, target.kind, target.display);
    return row?.reviewId ?? null;
  }

  public close(): void {
    if (!this.#closed) {
      this.#database.close();
      this.#closed = true;
    }
  }
}

export function openSqliteProjectStore(options: {
  databasePath: string;
  migrationsFolder?: string;
}): SqliteProjectStore {
  try {
    mkdirSync(dirname(options.databasePath), { recursive: true });
    const database = new Database(options.databasePath);
    database.pragma('foreign_keys = ON');
    database.pragma('journal_mode = WAL');
    return new SqliteProjectStore(database, options.migrationsFolder ?? DEFAULT_MIGRATIONS_FOLDER);
  } catch (error) {
    throw new SqliteProjectStoreError(
      'DATABASE_OPEN_FAILED',
      'Project Memory could not open its local database. Check the app-data directory.',
      { cause: error },
    );
  }
}
