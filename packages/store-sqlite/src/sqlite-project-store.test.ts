import { access, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createReviewRunFixture } from '@gatekeeper/testkit';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import {
  openSqliteProjectStore,
  type SqliteProjectStore,
  SqliteProjectStoreError,
  type SqliteIndexBatch,
  type SqliteRemoteSyncBatch,
} from './sqlite-project-store.js';

const temporaryRoots: string[] = [];
const openStores: SqliteProjectStore[] = [];

function openStore(options: Parameters<typeof openSqliteProjectStore>[0]): SqliteProjectStore {
  const store = openSqliteProjectStore(options);
  openStores.push(store);
  return store;
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'gatekeeper-store-'));
  temporaryRoots.push(root);
  return root;
}

function createBatch(overrides: Partial<SqliteIndexBatch> = {}): SqliteIndexBatch {
  return {
    repositoryId: 'repository_fixture',
    head: 'a'.repeat(40),
    indexedAt: '2026-07-18T18:01:00.000Z',
    files: [
      {
        path: 'docs/adr/0003-no-required-redis.md',
        objectId: 'b'.repeat(40),
        mode: '100644',
        sizeBytes: 42,
      },
    ],
    documents: [
      {
        documentId: 'document_redis',
        sourceType: 'adr',
        sourceId: 'docs/adr/0003-no-required-redis.md',
        title: 'No required Redis',
        path: 'docs/adr/0003-no-required-redis.md',
        commitSha: null,
        excerpt: 'Required Redis caused deployment regressions. Keep cache optional.',
        contentHash: 'c'.repeat(64),
        status: 'active',
        occurredAt: null,
        chunkIndex: 0,
      },
    ],
    commits: [],
    ...overrides,
  };
}

afterEach(async () => {
  for (const store of openStores.splice(0)) {
    store.close();
  }
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe('SQLite Project Memory store', () => {
  it('migrates a new WAL database with foreign keys, ordinary tables, FTS5, and a journal', async () => {
    const root = await temporaryRoot();
    const databasePath = join(root, 'gatekeeper.db');
    const store = openStore({ databasePath });

    store.migrate();
    expect(store.capabilities()).toEqual({ foreignKeys: true, fts5: true, journalMode: 'wal' });
    store.close();

    const database = new Database(databasePath, { readonly: true });
    const names = database
      .prepare("select name from sqlite_master where type in ('table', 'trigger') order by name")
      .all()
      .map((row) => (row as { name: string }).name);
    database.close();

    expect(names).toEqual(
      expect.arrayContaining([
        '__drizzle_migrations',
        'commits',
        'document_fts',
        'document_fts_ai',
        'document_fts_au',
        'document_fts_ad',
        'document_links',
        'documents',
        'files',
        'finding_evidence',
        'findings',
        'index_state',
        'repositories',
        'review_operations',
        'review_runs',
        'sync_cursors',
      ]),
    );
  });

  it('returns at most ten newest commit records for one repository', async () => {
    const root = await temporaryRoot();
    const store = openStore({ databasePath: join(root, 'gatekeeper.db') });
    store.migrate();
    store.registerRepository({
      schemaVersion: 1,
      repositoryId: 'repository_fixture',
      root,
      normalizedRoot: root,
      remote: null,
      normalizedRemote: null,
      createdAt: '2026-07-18T18:00:00.000Z',
      updatedAt: '2026-07-18T18:00:00.000Z',
    });
    const commits = Array.from({ length: 12 }, (_, index) => ({
      sha: index.toString(16).repeat(40),
      authoredAt: `2026-07-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
      title: `Commit ${index + 1}`,
      message: `Bounded message ${index + 1}`,
    }));
    store.applyIndex(createBatch({ commits }));

    expect(store.recentCommits('repository_fixture')).toEqual(
      commits
        .slice(2)
        .reverse()
        .map(({ sha, authoredAt, title }) => ({ sha, authoredAt, title })),
    );
    expect(store.recentCommits('repository_other')).toEqual([]);
  });

  it('returns indexed and immutable-review state only for the requested repository commits', async () => {
    const root = await temporaryRoot();
    const store = openStore({ databasePath: join(root, 'gatekeeper.db') });
    store.migrate();
    store.registerRepository({
      schemaVersion: 1,
      repositoryId: 'repository_fixture',
      root,
      normalizedRoot: root,
      remote: null,
      normalizedRemote: null,
      createdAt: '2026-07-18T18:00:00.000Z',
      updatedAt: '2026-07-18T18:00:00.000Z',
    });
    const indexedSha = 'a'.repeat(40);
    const reviewedSha = 'b'.repeat(40);
    const absentSha = 'c'.repeat(40);
    store.applyIndex(
      createBatch({
        commits: [
          {
            sha: indexedSha,
            authoredAt: '2026-07-19T12:00:00.000Z',
            title: 'Indexed local commit',
            message: 'Bounded commit metadata.',
          },
        ],
      }),
    );
    store.saveReview({
      ...createReviewRunFixture(),
      reviewId: 'review_indexed_commit_state',
      repositoryId: 'repository_fixture',
      target: {
        kind: 'commit_range',
        display: `Commit ${reviewedSha.slice(0, 12)}`,
        base: 'd'.repeat(40),
        head: reviewedSha,
      },
    });

    expect(
      store.commitStates('repository_fixture', [indexedSha, reviewedSha, absentSha, indexedSha]),
    ).toEqual([
      { sha: indexedSha, indexed: true, reviewed: false },
      { sha: reviewedSha, indexed: false, reviewed: true },
      { sha: absentSha, indexed: false, reviewed: false },
    ]);
    expect(store.commitStates('repository_other', [indexedSha, reviewedSha])).toEqual([
      { sha: indexedSha, indexed: false, reviewed: false },
      { sha: reviewedSha, indexed: false, reviewed: false },
    ]);
  });

  it('upserts remote documents and ordered links without deleting local memory', async () => {
    const root = await temporaryRoot();
    const store = openStore({ databasePath: join(root, 'gatekeeper.db') });
    store.migrate();
    store.registerRepository({
      schemaVersion: 1,
      repositoryId: 'repository_fixture',
      root,
      normalizedRoot: root,
      remote: 'https://github.com/acme/demo.git',
      normalizedRemote: 'github.com/acme/demo',
      createdAt: '2026-07-18T18:00:00.000Z',
      updatedAt: '2026-07-18T18:00:00.000Z',
    });
    store.applyIndex(createBatch());

    const batch: SqliteRemoteSyncBatch = {
      repositoryId: 'repository_fixture',
      provider: 'github',
      syncedAt: '2026-07-18T19:00:00.000Z',
      cursor: '2026-07-18T18:59:00.000Z',
      partial: false,
      failures: [],
      documents: [
        {
          documentId: 'document_pr_12',
          sourceType: 'pull_request',
          sourceId: 'pull_request:#12',
          title: 'Require Redis cache',
          path: null,
          commitSha: null,
          remoteUrl: 'https://github.com/acme/demo/pull/12',
          excerpt: 'Reintroduce required Redis.',
          contentHash: '1'.repeat(64),
          status: 'active',
          occurredAt: '2026-07-18T18:30:00.000Z',
          chunkIndex: 0,
        },
        {
          documentId: 'document_issue_4',
          sourceType: 'issue',
          sourceId: 'issue:#4',
          title: 'Proposal: Redis cache',
          path: null,
          commitSha: null,
          remoteUrl: 'https://github.com/acme/demo/issues/4',
          excerpt: 'Propose Redis.',
          contentHash: '2'.repeat(64),
          status: 'historical',
          occurredAt: '2026-07-01T00:00:00.000Z',
          chunkIndex: 0,
        },
        {
          documentId: 'document_pr_8',
          sourceType: 'pull_request',
          sourceId: 'pull_request:#8',
          title: 'Revert Redis',
          path: null,
          commitSha: null,
          remoteUrl: 'https://github.com/acme/demo/pull/8',
          excerpt: 'Revert required Redis after regressions.',
          contentHash: '3'.repeat(64),
          status: 'historical',
          occurredAt: '2026-07-08T00:00:00.000Z',
          chunkIndex: 0,
        },
      ],
      links: [
        {
          fromSourceType: 'pull_request',
          fromSourceId: 'pull_request:#12',
          toSourceType: 'issue',
          toSourceId: 'issue:#4',
          type: 'implements',
          position: 0,
        },
        {
          fromSourceType: 'pull_request',
          fromSourceId: 'pull_request:#12',
          toSourceType: 'pull_request',
          toSourceId: 'pull_request:#8',
          type: 'reverts',
          position: 1,
        },
        {
          fromSourceType: 'pull_request',
          fromSourceId: 'pull_request:#12',
          toSourceType: 'adr',
          toSourceId: 'docs/adr/0003-no-required-redis.md',
          type: 'supersedes',
          position: 2,
        },
      ],
    };

    const first = store.applyRemoteSync(batch);
    const second = store.applyRemoteSync({
      ...batch,
      syncedAt: '2026-07-18T19:01:00.000Z',
    });

    expect(first.documents).toEqual({ received: 3, written: 3, unchanged: 0 });
    expect(first.links).toEqual({ received: 3, written: 3, unchanged: 0 });
    expect(second.documents).toEqual({ received: 3, written: 0, unchanged: 3 });
    expect(second.links).toEqual({ received: 3, written: 0, unchanged: 3 });
    expect(store.getSyncCursor('repository_fixture', 'github')).toBe('2026-07-18T18:59:00.000Z');

    store.applyIndex(
      createBatch({
        indexedAt: '2026-07-18T19:02:00.000Z',
      }),
    );

    const evidence = store.search({
      repositoryId: 'repository_fixture',
      query: 'pull_request:#12',
      limit: 10,
    });
    expect(evidence.map(({ evidence: pointer }) => pointer.sourceId)).toEqual([
      'pull_request:#12',
      'issue:#4',
      'pull_request:#8',
      'docs/adr/0003-no-required-redis.md',
    ]);
    expect(evidence.map(({ match }) => match)).toEqual(['exact', 'linked', 'linked', 'linked']);
    expect(evidence.map(({ relationship }) => relationship)).toEqual([
      undefined,
      'implements',
      'reverts',
      'supersedes',
    ]);
    expect(evidence[0]?.evidence.remoteUrl).toBe('https://github.com/acme/demo/pull/12');
  });

  it('writes valid partial records atomically but does not advance the sync cursor', async () => {
    const root = await temporaryRoot();
    const store = openStore({ databasePath: join(root, 'gatekeeper.db') });
    store.migrate();
    store.registerRepository({
      schemaVersion: 1,
      repositoryId: 'repository_fixture',
      root,
      normalizedRoot: root,
      remote: 'https://github.com/acme/demo.git',
      normalizedRemote: 'github.com/acme/demo',
      createdAt: '2026-07-18T18:00:00.000Z',
      updatedAt: '2026-07-18T18:00:00.000Z',
    });
    const batch: SqliteRemoteSyncBatch = {
      repositoryId: 'repository_fixture',
      provider: 'github',
      syncedAt: '2026-07-18T19:00:00.000Z',
      cursor: '2026-07-18T18:59:00.000Z',
      partial: true,
      failures: [{ source: 'issues[1]', code: 'malformed_record' }],
      documents: [
        {
          documentId: 'document_issue_4',
          sourceType: 'issue',
          sourceId: 'issue:#4',
          title: 'Valid issue',
          path: null,
          commitSha: null,
          remoteUrl: 'https://github.com/acme/demo/issues/4',
          excerpt: 'Valid bounded content.',
          contentHash: '4'.repeat(64),
          status: 'active',
          occurredAt: '2026-07-18T18:00:00.000Z',
          chunkIndex: 0,
        },
      ],
      links: [],
    };

    const result = store.applyRemoteSync(batch);

    expect(result.partial).toBe(true);
    expect(result.documents.written).toBe(1);
    expect(store.getSyncCursor('repository_fixture', 'github')).toBeNull();
    expect(store.search({ repositoryId: 'repository_fixture', query: 'issue:#4' })).toHaveLength(1);
  });

  it('does not let a stale replay regress the cursor or overwrite newer remote evidence', async () => {
    const root = await temporaryRoot();
    const store = openStore({ databasePath: join(root, 'gatekeeper.db') });
    store.migrate();
    store.registerRepository({
      schemaVersion: 1,
      repositoryId: 'repository_fixture',
      root,
      normalizedRoot: root,
      remote: 'https://github.com/acme/demo.git',
      normalizedRemote: 'github.com/acme/demo',
      createdAt: '2026-07-18T18:00:00.000Z',
      updatedAt: '2026-07-18T18:00:00.000Z',
    });
    const current: SqliteRemoteSyncBatch = {
      repositoryId: 'repository_fixture',
      provider: 'github',
      syncedAt: '2026-07-18T19:00:00.000Z',
      cursor: '2026-07-18T19:00:00.000Z',
      partial: false,
      failures: [],
      documents: [
        {
          documentId: 'document_issue_4',
          sourceType: 'issue',
          sourceId: 'issue:#4',
          title: 'Current issue',
          path: null,
          commitSha: null,
          remoteUrl: 'https://github.com/acme/demo/issues/4',
          excerpt: 'Current evidence.',
          contentHash: '9'.repeat(64),
          status: 'active',
          occurredAt: '2026-07-18T19:00:00.000Z',
          chunkIndex: 0,
        },
      ],
      links: [],
    };
    store.applyRemoteSync(current);
    store.applyRemoteSync({
      ...current,
      syncedAt: '2026-07-18T19:01:00.000Z',
      cursor: '2026-07-18T18:00:00.000Z',
      documents: [
        {
          ...current.documents[0]!,
          title: 'Stale issue',
          excerpt: 'Stale evidence.',
          contentHash: '8'.repeat(64),
          occurredAt: '2026-07-18T18:00:00.000Z',
        },
      ],
    });

    expect(store.getSyncCursor('repository_fixture', 'github')).toBe('2026-07-18T19:00:00.000Z');
    expect(
      store.search({ repositoryId: 'repository_fixture', query: 'issue:#4' })[0]?.evidence,
    ).toMatchObject({ title: 'Current issue', excerpt: 'Current evidence.' });
  });

  it('reopens and migrates an already migrated database idempotently', async () => {
    const root = await temporaryRoot();
    const databasePath = join(root, 'gatekeeper.db');
    const first = openStore({ databasePath });
    first.migrate();
    first.close();

    const second = openStore({ databasePath });
    expect(() => second.migrate()).not.toThrow();
    expect(second.capabilities().fts5).toBe(true);
    second.close();
  });

  it('fails with a stable error when the database parent is not a directory', async () => {
    const root = await temporaryRoot();
    const blockedParent = join(root, 'blocked');
    await writeFile(blockedParent, 'not a directory', 'utf8');

    expect(() => openStore({ databasePath: join(blockedParent, 'gatekeeper.db') })).toThrowError(
      expect.objectContaining({
        code: 'DATABASE_OPEN_FAILED',
        message: 'Project Memory could not open its local database. Check the app-data directory.',
      }),
    );
  });

  it('reports an actionable stable error when migrations cannot load', async () => {
    const root = await temporaryRoot();
    const databasePath = join(root, 'gatekeeper.db');
    const missingMigrations = join(root, 'missing-migrations');
    const store = openStore({ databasePath, migrationsFolder: missingMigrations });

    expect(() => store.migrate()).toThrowError(SqliteProjectStoreError);
    try {
      store.migrate();
    } catch (error) {
      expect(error).toMatchObject({
        code: 'MIGRATION_FAILED',
        message:
          'Project Memory migrations failed. Reinstall Gatekeeper or repair the local database.',
      });
    }
    store.close();
  });

  it('rolls back statements from an interrupted migration', async () => {
    const root = await temporaryRoot();
    const databasePath = join(root, 'gatekeeper.db');
    const migrationsFolder = join(root, 'broken-migrations');
    await mkdir(join(migrationsFolder, 'meta'), { recursive: true });
    await writeFile(
      join(migrationsFolder, 'meta', '_journal.json'),
      JSON.stringify({
        version: '7',
        dialect: 'sqlite',
        entries: [{ idx: 0, version: '6', when: 1, tag: '0000_broken', breakpoints: true }],
      }),
    );
    await writeFile(
      join(migrationsFolder, '0000_broken.sql'),
      'CREATE TABLE partial_write (id integer);\n--> statement-breakpoint\nNOT VALID SQL;',
    );
    const store = openStore({ databasePath, migrationsFolder });

    expect(() => store.migrate()).toThrowError(SqliteProjectStoreError);
    store.close();

    const database = new Database(databasePath, { readonly: true });
    expect(
      database
        .prepare("select name from sqlite_master where type = 'table' and name = 'partial_write'")
        .get(),
    ).toBeUndefined();
    database.close();
  });

  it('rejects duplicate batch identities and missing repository foreign keys safely', async () => {
    const root = await temporaryRoot();
    const store = openStore({ databasePath: join(root, 'gatekeeper.db') });
    store.migrate();
    const batch = createBatch();

    expect(() =>
      store.applyIndex({ ...batch, documents: [batch.documents[0]!, batch.documents[0]!] }),
    ).toThrowError(
      expect.objectContaining({
        code: 'INVALID_INDEX_BATCH',
        message: 'Project Memory received duplicate document records.',
      }),
    );
    expect(() => store.applyIndex(batch)).toThrowError(
      expect.objectContaining({
        code: 'INDEX_WRITE_FAILED',
        message: 'Project Memory could not write the index transaction.',
      }),
    );
    store.close();
  });

  it('rolls back an index transaction that fails after writing files', async () => {
    const root = await temporaryRoot();
    const databasePath = join(root, 'gatekeeper.db');
    const store = openStore({ databasePath });
    store.migrate();
    const registration = {
      schemaVersion: 1 as const,
      remote: null,
      normalizedRemote: null,
      createdAt: '2026-07-18T18:00:00.000Z',
      updatedAt: '2026-07-18T18:00:00.000Z',
    };
    store.registerRepository({
      ...registration,
      repositoryId: 'repository_fixture',
      root: 'D:/work/fixture',
      normalizedRoot: 'd:/work/fixture',
    });
    store.registerRepository({
      ...registration,
      repositoryId: 'repository_other',
      root: 'D:/work/other',
      normalizedRoot: 'd:/work/other',
    });
    store.applyIndex(createBatch());

    expect(() => store.applyIndex(createBatch({ repositoryId: 'repository_other' }))).toThrowError(
      expect.objectContaining({
        code: 'INVALID_INDEX_BATCH',
        message: 'Project Memory received a document identity owned by another repository.',
      }),
    );
    expect(store.getIndexState('repository_other')).toBeNull();
    store.close();

    const database = new Database(databasePath, { readonly: true });
    expect(
      database
        .prepare('select count(*) from files where repository_id = ?')
        .pluck()
        .get('repository_other'),
    ).toBe(0);
    expect(
      database
        .prepare('select count(*) from documents where repository_id = ?')
        .pluck()
        .get('repository_other'),
    ).toBe(0);
    database.close();
  });

  it('keeps FTS5 synchronized across insert, update, and delete', async () => {
    const root = await temporaryRoot();
    const store = openStore({ databasePath: join(root, 'gatekeeper.db') });
    store.migrate();
    store.registerRepository({
      schemaVersion: 1,
      repositoryId: 'repository_fixture',
      root: 'D:/work/fixture',
      normalizedRoot: 'd:/work/fixture',
      remote: null,
      normalizedRemote: null,
      createdAt: '2026-07-18T18:00:00.000Z',
      updatedAt: '2026-07-18T18:00:00.000Z',
    });

    expect(store.applyIndex(createBatch()).documents.written).toBe(1);
    expect(
      store.search({ repositoryId: 'repository_fixture', query: 'redis', limit: 20 })[0],
    ).toMatchObject({ documentId: 'document_redis', match: 'fts' });

    const updated = createBatch({
      documents: [
        {
          ...createBatch().documents[0]!,
          sourceId: 'docs/adr/in-process-cache.md',
          title: 'In-process cache',
          path: 'docs/adr/in-process-cache.md',
          excerpt: 'The deployment now uses an in-process memory cache.',
          contentHash: 'd'.repeat(64),
        },
      ],
    });
    expect(store.applyIndex(updated).documents.written).toBe(1);
    expect(store.search({ repositoryId: 'repository_fixture', query: 'redis', limit: 20 })).toEqual(
      [],
    );
    expect(
      store.search({ repositoryId: 'repository_fixture', query: 'memory', limit: 20 }),
    ).toHaveLength(1);

    expect(store.applyIndex(createBatch({ files: [], documents: [] })).documents.deleted).toBe(1);
    expect(
      store.search({ repositoryId: 'repository_fixture', query: 'memory', limit: 20 }),
    ).toEqual([]);
    store.close();
  });

  it('returns exact source matches before lexical matches and safely escapes FTS syntax', async () => {
    const root = await temporaryRoot();
    const store = openStore({ databasePath: join(root, 'gatekeeper.db') });
    store.migrate();
    store.registerRepository({
      schemaVersion: 1,
      repositoryId: 'repository_fixture',
      root: 'D:/work/fixture',
      normalizedRoot: 'd:/work/fixture',
      remote: null,
      normalizedRemote: null,
      createdAt: '2026-07-18T18:00:00.000Z',
      updatedAt: '2026-07-18T18:00:00.000Z',
    });
    const base = createBatch();
    store.applyIndex({
      ...base,
      documents: [
        { ...base.documents[0]!, documentId: 'document_exact', sourceId: 'redis' },
        {
          ...base.documents[0]!,
          documentId: 'document_lexical',
          sourceId: 'docs/cache.md',
          path: 'docs/cache.md',
          title: 'Redis cache history',
        },
      ],
    });

    expect(
      store
        .search({ repositoryId: 'repository_fixture', query: 'redis', limit: 20 })
        .map(({ documentId }) => documentId),
    ).toEqual(['document_exact', 'document_lexical']);
    expect(() =>
      store.search({ repositoryId: 'repository_fixture', query: '" OR * NOT (', limit: 20 }),
    ).not.toThrow();
    store.close();
  });

  it('persists review runs, findings, and evidence atomically', async () => {
    const root = await temporaryRoot();
    const store = openStore({ databasePath: join(root, 'gatekeeper.db') });
    store.migrate();
    store.registerRepository({
      schemaVersion: 1,
      repositoryId: 'repository_fixture',
      root: 'D:/work/fixture',
      normalizedRoot: 'd:/work/fixture',
      remote: null,
      normalizedRemote: null,
      createdAt: '2026-07-18T18:00:00.000Z',
      updatedAt: '2026-07-18T18:00:00.000Z',
    });
    const review = {
      ...createReviewRunFixture(),
      repositoryId: 'repository_fixture',
      findings: [
        {
          id: 'finding_fixture',
          category: 'history',
          severity: 'medium',
          authority: 'EVIDENCE_SUPPORTED',
          confidence: 0.9,
          title: 'Redis was reverted',
          explanation: 'A prior change was reverted after deployment regressions.',
          evidence: [
            {
              sourceType: 'adr',
              repositoryId: 'repository_fixture',
              sourceId: 'docs/adr/0003-no-required-redis.md',
              excerpt: 'Keep cache optional.',
            },
          ],
          remediation: ['Use the in-process cache boundary.'],
          humanApprovalRequired: true,
        },
      ],
    } as const;

    store.saveReview(review);
    expect(store.getReview(review.reviewId)).toEqual(review);
    expect(store.latestReviewId(review.repositoryId, review.target)).toBe(review.reviewId);
    store.close();

    const database = new Database(join(root, 'gatekeeper.db'), { readonly: true });
    expect(database.prepare('select count(*) from findings').pluck().get()).toBe(1);
    expect(database.prepare('select count(*) from finding_evidence').pluck().get()).toBe(1);
    database.close();

    const reopened = openStore({ databasePath: join(root, 'gatekeeper.db') });
    reopened.migrate();
    expect(reopened.getReview(review.reviewId)).toEqual(review);
    reopened.close();
  });

  it('uses full commit identity instead of the abbreviated target display', async () => {
    const root = await temporaryRoot();
    const store = openStore({ databasePath: join(root, 'gatekeeper.db') });
    store.migrate();
    store.registerRepository({
      schemaVersion: 1,
      repositoryId: 'repository_fixture',
      root: 'D:/work/fixture',
      normalizedRoot: 'd:/work/fixture',
      remote: null,
      normalizedRemote: null,
      createdAt: '2026-07-18T18:00:00.000Z',
      updatedAt: '2026-07-18T18:00:00.000Z',
    });
    const firstHead = `${'a'.repeat(12)}${'1'.repeat(28)}`;
    const secondHead = `${'a'.repeat(12)}${'2'.repeat(28)}`;
    const first = {
      ...createReviewRunFixture(),
      reviewId: 'review_commit_prefix_first',
      repositoryId: 'repository_fixture',
      target: {
        kind: 'commit_range' as const,
        display: `Commit ${firstHead.slice(0, 12)}`,
        base: 'b'.repeat(40),
        head: firstHead,
      },
    };
    const second = {
      ...first,
      reviewId: 'review_commit_prefix_second',
      target: { ...first.target, head: secondHead },
    };

    store.saveReview(first);
    expect(store.latestReviewId(second.repositoryId, second.target)).toBeNull();
    store.saveReview(second);
    expect(store.latestReviewId(first.repositoryId, first.target)).toBe(first.reviewId);
    expect(store.latestReviewId(second.repositoryId, second.target)).toBe(second.reviewId);
  });

  it('backfills an empty legacy target key from its validated stored review', async () => {
    const root = await temporaryRoot();
    const databasePath = join(root, 'gatekeeper.db');
    const store = openStore({ databasePath });
    store.migrate();
    store.registerRepository({
      schemaVersion: 1,
      repositoryId: 'repository_fixture',
      root: 'D:/work/fixture',
      normalizedRoot: 'd:/work/fixture',
      remote: null,
      normalizedRemote: null,
      createdAt: '2026-07-18T18:00:00.000Z',
      updatedAt: '2026-07-18T18:00:00.000Z',
    });
    const head = 'c'.repeat(40);
    const review = {
      ...createReviewRunFixture(),
      reviewId: 'review_legacy_target_key',
      repositoryId: 'repository_fixture',
      target: {
        kind: 'commit_range' as const,
        display: `Commit ${head.slice(0, 12)}`,
        base: 'b'.repeat(40),
        head,
      },
    };
    store.saveReview(review);
    store.close();

    const database = new Database(databasePath);
    database
      .prepare('update review_runs set target_key = ? where review_id = ?')
      .run('', review.reviewId);
    database.close();

    const reopened = openStore({ databasePath });
    reopened.migrate();
    expect(reopened.latestReviewId(review.repositoryId, review.target)).toBe(review.reviewId);
    reopened.close();

    const checked = new Database(databasePath, { readonly: true });
    expect(
      checked
        .prepare('select target_key as targetKey from review_runs where review_id = ?')
        .get(review.reviewId),
    ).toEqual({ targetKey: `commit:${head}` });
    checked.close();
  });

  it('fails closed instead of guessing a malformed legacy target identity', async () => {
    const root = await temporaryRoot();
    const databasePath = join(root, 'gatekeeper.db');
    const store = openStore({ databasePath });
    store.migrate();
    store.registerRepository({
      schemaVersion: 1,
      repositoryId: 'repository_fixture',
      root: 'D:/work/fixture',
      normalizedRoot: 'd:/work/fixture',
      remote: null,
      normalizedRemote: null,
      createdAt: '2026-07-18T18:00:00.000Z',
      updatedAt: '2026-07-18T18:00:00.000Z',
    });
    const review = { ...createReviewRunFixture(), repositoryId: 'repository_fixture' };
    store.saveReview(review);
    store.close();

    const database = new Database(databasePath);
    database
      .prepare('update review_runs set target_key = ?, review_json = ? where review_id = ?')
      .run('', '{', review.reviewId);
    database.close();

    const reopened = openStore({ databasePath });
    expect(() => reopened.migrate()).toThrowError(
      expect.objectContaining({
        code: 'MIGRATION_FAILED',
        message:
          'Project Memory migrations failed. Reinstall Gatekeeper or repair the local database.',
      }),
    );
    reopened.close();
  });

  it('persists review operation progress and completes it with the review transaction', async () => {
    const root = await temporaryRoot();
    const databasePath = join(root, 'gatekeeper.db');
    const store = openStore({ databasePath });
    store.migrate();
    store.registerRepository({
      schemaVersion: 1,
      repositoryId: 'repository_fixture',
      root: 'D:/work/fixture',
      normalizedRoot: 'd:/work/fixture',
      remote: null,
      normalizedRemote: null,
      createdAt: '2026-07-18T18:00:00.000Z',
      updatedAt: '2026-07-18T18:00:00.000Z',
    });
    const review = { ...createReviewRunFixture(), repositoryId: 'repository_fixture' };
    const queued = {
      schemaVersion: 1 as const,
      reviewId: review.reviewId,
      repositoryId: review.repositoryId,
      target: review.target,
      status: 'queued' as const,
      stage: 'queued' as const,
      createdAt: review.createdAt,
      updatedAt: review.createdAt,
    };

    store.saveReviewOperation(queued);
    expect(store.getReviewOperation(review.reviewId)).toEqual(queued);

    const running = {
      ...queued,
      status: 'running' as const,
      stage: 'evaluating_change' as const,
      updatedAt: '2026-07-18T18:01:00.000Z',
    };
    store.saveReviewOperation(running);
    expect(store.getReviewOperation(review.reviewId)).toEqual(running);

    store.saveReview(review);
    expect(store.getReviewOperation(review.reviewId)).toEqual({
      ...running,
      status: 'completed',
      stage: 'completed',
      review,
      previousReview: null,
      historySync: null,
      evidenceTimeline: [],
      updatedAt: review.createdAt,
    });

    store.close();
    const reopened = openStore({ databasePath });
    reopened.migrate();
    expect(reopened.getReviewOperation(review.reviewId)).toEqual(
      expect.objectContaining({ status: 'completed', review }),
    );
  });

  it('fails interrupted operations safely and protects operation ownership', async () => {
    const root = await temporaryRoot();
    const store = openStore({ databasePath: join(root, 'gatekeeper.db') });
    store.migrate();
    const registration = {
      schemaVersion: 1 as const,
      remote: null,
      normalizedRemote: null,
      createdAt: '2026-07-18T18:00:00.000Z',
      updatedAt: '2026-07-18T18:00:00.000Z',
    };
    store.registerRepository({
      ...registration,
      repositoryId: 'repository_fixture',
      root: 'D:/work/fixture',
      normalizedRoot: 'd:/work/fixture',
    });
    store.registerRepository({
      ...registration,
      repositoryId: 'repository_other',
      root: 'D:/work/other',
      normalizedRoot: 'd:/work/other',
    });
    const review = { ...createReviewRunFixture(), repositoryId: 'repository_fixture' };
    const queued = {
      schemaVersion: 1 as const,
      reviewId: review.reviewId,
      repositoryId: review.repositoryId,
      target: review.target,
      status: 'queued' as const,
      stage: 'queued' as const,
      createdAt: review.createdAt,
      updatedAt: review.createdAt,
    };
    store.saveReviewOperation(queued);

    expect(() =>
      store.saveReviewOperation({ ...queued, repositoryId: 'repository_other' }),
    ).toThrowError(
      expect.objectContaining({
        code: 'REVIEW_OPERATION_WRITE_FAILED',
        message: 'Project Memory could not persist the review operation.',
      }),
    );
    expect(store.failInterruptedReviewOperations('2026-07-18T19:00:00.000Z')).toBe(1);
    expect(store.getReviewOperation(review.reviewId)).toEqual(
      expect.objectContaining({
        repositoryId: 'repository_fixture',
        status: 'failed',
        stage: 'failed',
        error: {
          code: 'REVIEW_FAILED',
          message: 'The review was interrupted when the local service stopped.',
          repair: 'Start a new review from the dashboard.',
        },
      }),
    );
  });

  it('inspects and explicitly repairs only corrupt persisted review operations', async () => {
    const root = await temporaryRoot();
    const databasePath = join(root, 'gatekeeper.db');
    const store = openStore({ databasePath });
    store.migrate();
    store.registerRepository({
      schemaVersion: 1,
      repositoryId: 'repository_fixture',
      root: 'D:/work/fixture',
      normalizedRoot: 'd:/work/fixture',
      remote: null,
      normalizedRemote: null,
      createdAt: '2026-07-18T18:00:00.000Z',
      updatedAt: '2026-07-18T18:00:00.000Z',
    });
    const review = { ...createReviewRunFixture(), repositoryId: 'repository_fixture' };
    const validReview = { ...review, reviewId: 'review_valid_operation' };
    store.saveReviewOperation({
      schemaVersion: 1,
      reviewId: review.reviewId,
      repositoryId: review.repositoryId,
      target: review.target,
      status: 'queued',
      stage: 'queued',
      createdAt: review.createdAt,
      updatedAt: review.createdAt,
    });
    store.saveReviewOperation({
      schemaVersion: 1,
      reviewId: validReview.reviewId,
      repositoryId: validReview.repositoryId,
      target: validReview.target,
      status: 'queued',
      stage: 'queued',
      createdAt: validReview.createdAt,
      updatedAt: validReview.createdAt,
    });
    store.close();

    const database = new Database(databasePath);
    database
      .prepare('update review_operations set operation_json = ? where review_id = ?')
      .run('{', review.reviewId);
    database.close();

    const reopened = openStore({ databasePath });
    reopened.migrate();
    expect(() => reopened.getReviewOperation(review.reviewId)).toThrowError(
      'The stored review operation is corrupt and cannot be read safely.',
    );
    expect(reopened.inspectStoredState()).toEqual({
      integrity: 'corrupt',
      corruptReviewOperations: 1,
    });

    const backupPath = join(root, 'backups', 'project-memory-before-repair.sqlite3');
    await expect(reopened.repairCorruptReviewOperations(backupPath)).resolves.toEqual({
      repaired: 1,
      backupPath,
    });
    await expect(access(backupPath)).resolves.toBeUndefined();
    const backup = new Database(backupPath, { readonly: true });
    expect(
      backup
        .prepare(
          'select operation_json as operationJson from review_operations where review_id = ?',
        )
        .get(review.reviewId),
    ).toEqual({ operationJson: '{' });
    backup.close();
    expect(reopened.getReviewOperation(review.reviewId)).toBeNull();
    expect(reopened.getReviewOperation(validReview.reviewId)).toEqual(
      expect.objectContaining({ status: 'queued' }),
    );
  });

  it('rolls back and sanitizes a failed review transaction', async () => {
    const root = await temporaryRoot();
    const store = openStore({ databasePath: join(root, 'gatekeeper.db') });
    store.migrate();
    const review = createReviewRunFixture();

    expect(() => store.saveReview(review)).toThrowError(
      expect.objectContaining({
        code: 'REVIEW_WRITE_FAILED',
        message: 'Project Memory could not persist the review transaction.',
      }),
    );
    expect(store.getReview(review.reviewId)).toBeNull();
    store.close();
  });

  it('does not let a colliding review ID move a review between repositories', async () => {
    const root = await temporaryRoot();
    const store = openStore({ databasePath: join(root, 'gatekeeper.db') });
    store.migrate();
    const registration = {
      schemaVersion: 1 as const,
      remote: null,
      normalizedRemote: null,
      createdAt: '2026-07-18T18:00:00.000Z',
      updatedAt: '2026-07-18T18:00:00.000Z',
    };
    store.registerRepository({
      ...registration,
      repositoryId: 'repository_fixture',
      root: 'D:/work/fixture',
      normalizedRoot: 'd:/work/fixture',
    });
    store.registerRepository({
      ...registration,
      repositoryId: 'repository_other',
      root: 'D:/work/other',
      normalizedRoot: 'd:/work/other',
    });
    const original = { ...createReviewRunFixture(), repositoryId: 'repository_fixture' };
    store.saveReview(original);

    expect(() =>
      store.saveReview({
        ...original,
        repositoryId: 'repository_other',
        summary: 'This collision must not replace the original review.',
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'REVIEW_WRITE_FAILED',
        message: 'Project Memory could not persist the review transaction.',
      }),
    );
    expect(store.getReview(original.reviewId)).toEqual(original);
    store.close();
  });

  it('fails closed with a stable error when persisted review JSON is corrupt', async () => {
    const root = await temporaryRoot();
    const databasePath = join(root, 'gatekeeper.db');
    const store = openStore({ databasePath });
    store.migrate();
    store.registerRepository({
      schemaVersion: 1,
      repositoryId: 'repository_fixture',
      root: 'D:/work/fixture',
      normalizedRoot: 'd:/work/fixture',
      remote: null,
      normalizedRemote: null,
      createdAt: '2026-07-18T18:00:00.000Z',
      updatedAt: '2026-07-18T18:00:00.000Z',
    });
    const review = { ...createReviewRunFixture(), repositoryId: 'repository_fixture' };
    store.saveReview(review);
    store.close();

    const database = new Database(databasePath);
    database
      .prepare('update review_runs set review_json = ? where review_id = ?')
      .run('{', review.reviewId);
    database.close();

    const reopened = openStore({ databasePath });
    reopened.migrate();
    expect(() => reopened.getReview(review.reviewId)).toThrowError(
      'The stored review is corrupt and cannot be read safely.',
    );
    reopened.close();
  });
});
