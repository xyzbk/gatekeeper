import {
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const repositories = sqliteTable(
  'repositories',
  {
    id: text('id').primaryKey(),
    root: text('root').notNull(),
    normalizedRoot: text('normalized_root').notNull(),
    remote: text('remote'),
    normalizedRemote: text('normalized_remote'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('repositories_normalized_root_unique').on(table.normalizedRoot),
    uniqueIndex('repositories_normalized_remote_unique').on(table.normalizedRemote),
  ],
);

export const indexState = sqliteTable('index_state', {
  repositoryId: text('repository_id')
    .primaryKey()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  head: text('head').notNull(),
  indexedAt: text('indexed_at').notNull(),
  fileCount: integer('file_count').notNull(),
  documentCount: integer('document_count').notNull(),
  commitCount: integer('commit_count').notNull(),
});

export const files = sqliteTable(
  'files',
  {
    repositoryId: text('repository_id')
      .notNull()
      .references(() => repositories.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    objectId: text('object_id').notNull(),
    mode: text('mode').notNull(),
    sizeBytes: integer('size_bytes'),
    indexedAt: text('indexed_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.repositoryId, table.path] })],
);

export const commits = sqliteTable(
  'commits',
  {
    repositoryId: text('repository_id')
      .notNull()
      .references(() => repositories.id, { onDelete: 'cascade' }),
    sha: text('sha').notNull(),
    authoredAt: text('authored_at').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    indexedAt: text('indexed_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.repositoryId, table.sha] })],
);

export const documents = sqliteTable(
  'documents',
  {
    rowid: integer('rowid').primaryKey({ autoIncrement: true }),
    id: text('id').notNull(),
    repositoryId: text('repository_id')
      .notNull()
      .references(() => repositories.id, { onDelete: 'cascade' }),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    title: text('title').notNull(),
    path: text('path'),
    commitSha: text('commit_sha'),
    excerpt: text('excerpt').notNull(),
    contentHash: text('content_hash').notNull(),
    status: text('status').notNull(),
    occurredAt: text('occurred_at'),
    remoteUrl: text('remote_url'),
    chunkIndex: integer('chunk_index').notNull(),
    indexedAt: text('indexed_at').notNull(),
  },
  (table) => [
    uniqueIndex('documents_id_unique').on(table.id),
    index('documents_repository_path_idx').on(table.repositoryId, table.path),
    index('documents_repository_source_idx').on(
      table.repositoryId,
      table.sourceType,
      table.sourceId,
    ),
  ],
);

export const documentLinks = sqliteTable(
  'document_links',
  {
    repositoryId: text('repository_id')
      .notNull()
      .references(() => repositories.id, { onDelete: 'cascade' }),
    fromDocumentId: text('from_document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    toDocumentId: text('to_document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    position: integer('position').notNull().default(0),
  },
  (table) => [
    primaryKey({
      columns: [table.repositoryId, table.fromDocumentId, table.toDocumentId, table.type],
    }),
  ],
);

export const syncCursors = sqliteTable(
  'sync_cursors',
  {
    repositoryId: text('repository_id')
      .notNull()
      .references(() => repositories.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    cursor: text('cursor').notNull(),
    syncedAt: text('synced_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.repositoryId, table.provider] })],
);

export const reviewRuns = sqliteTable(
  'review_runs',
  {
    reviewId: text('review_id').primaryKey(),
    repositoryId: text('repository_id')
      .notNull()
      .references(() => repositories.id, { onDelete: 'cascade' }),
    targetKind: text('target_kind').notNull(),
    targetDisplay: text('target_display').notNull(),
    verdict: text('verdict').notNull(),
    summary: text('summary').notNull(),
    createdAt: text('created_at').notNull(),
    previousReviewId: text('previous_review_id'),
    reviewJson: text('review_json').notNull(),
  },
  (table) => [
    index('review_runs_repository_target_idx').on(
      table.repositoryId,
      table.targetKind,
      table.targetDisplay,
      table.createdAt,
    ),
  ],
);

export const reviewOperations = sqliteTable(
  'review_operations',
  {
    reviewId: text('review_id').primaryKey(),
    repositoryId: text('repository_id')
      .notNull()
      .references(() => repositories.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    operationJson: text('operation_json').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('review_operations_repository_status_idx').on(table.repositoryId, table.status),
  ],
);

export const findings = sqliteTable(
  'findings',
  {
    reviewId: text('review_id')
      .notNull()
      .references(() => reviewRuns.reviewId, { onDelete: 'cascade' }),
    findingId: text('finding_id').notNull(),
    authority: text('authority').notNull(),
    severity: text('severity').notNull(),
    category: text('category').notNull(),
    findingJson: text('finding_json').notNull(),
  },
  (table) => [primaryKey({ columns: [table.reviewId, table.findingId] })],
);

export const findingEvidence = sqliteTable(
  'finding_evidence',
  {
    reviewId: text('review_id').notNull(),
    findingId: text('finding_id').notNull(),
    position: integer('position').notNull(),
    evidenceJson: text('evidence_json').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.reviewId, table.findingId, table.position] }),
    foreignKey({
      columns: [table.reviewId, table.findingId],
      foreignColumns: [findings.reviewId, findings.findingId],
    }).onDelete('cascade'),
  ],
);
