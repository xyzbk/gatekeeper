import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { EvidencePointer, RepositoryId, ReviewId } from '../packages/domain/src/index.js';
import { createGitHubProvider, normalizeGitHubRemote } from '../packages/github-gh/src/index.js';
import { createProjectMemory } from '../packages/project-memory/src/index.js';
import { prepareReviewDraft, reviewPullRequest } from '../packages/review-engine/src/index.js';
import { openSqliteProjectStore } from '../packages/store-sqlite/src/index.js';

import { createGhostChangeRunner, loadGhostChangeFixture } from './ghost-change-fixture.js';

export interface ModelDataDryRunReport {
  schemaVersion: 1;
  transport: 'none';
  modelCalls: 0;
  review: {
    reviewId: string;
    deterministicFindingCount: number;
  };
  untrustedEvidence: {
    count: number;
    pointers: Array<Pick<EvidencePointer, 'sourceId' | 'sourceType' | 'path'>>;
  };
}

export async function createModelDataDryRunReport(): Promise<ModelDataDryRunReport> {
  const fixture = await loadGhostChangeFixture();
  const provider = createGitHubProvider({ runGh: createGhostChangeRunner(fixture) });
  const remote = normalizeGitHubRemote(fixture.remote);
  const root = await mkdtemp(join(tmpdir(), 'gatekeeper-model-data-dry-run-'));
  const store = openSqliteProjectStore({ databasePath: join(root, 'memory.db') });
  const memory = createProjectMemory({
    persistence: store,
    git: {
      inspectRepository: () =>
        Promise.resolve({
          root,
          branch: 'master',
          head: 'a'.repeat(40),
          dirty: false,
          remote: fixture.remote,
        }),
      listTrackedFiles: () =>
        Promise.resolve([
          {
            path: 'docs/adr/0003-no-required-redis.md',
            objectId: 'b'.repeat(40),
            mode: '100644',
            sizeBytes: 150,
          },
        ]),
      listCommits: () => Promise.resolve([]),
      readFileAtRef: () =>
        Promise.resolve(
          '# No required Redis\n\nStatus: active\n\nSQLite remains the durable local store.',
        ),
    },
    now: () => '2026-07-18T18:00:00.000Z',
  });

  try {
    await memory.migrate();
    const repository = await memory.registerRepository({ root, remote: fixture.remote });
    await memory.indexLocalRepository({ repositoryId: repository.repositoryId });
    await memory.indexRemoteDocuments({
      repositoryId: repository.repositoryId,
      provider: 'github',
      batch: await provider.listHistoricalDocuments(remote),
    });
    const [pullRequest, changeSet] = await Promise.all([
      provider.getPullRequest(remote, fixture.pullRequestNumber),
      provider.getPullRequestDiff(remote, fixture.pullRequestNumber),
    ]);
    const review = reviewPullRequest({
      changeSet,
      pullRequest,
      createdAt: '2026-07-18T18:00:00.000Z',
      policy: { version: 1 },
      repositoryId: repository.repositoryId as RepositoryId,
      reviewId: 'review_model_data_dry_run' as ReviewId,
    });
    const draft = await prepareReviewDraft({
      review,
      searchMemory: (input) => memory.search(input),
    });
    const pointers = draft.evidenceCandidates.map(({ sourceId, sourceType, path }) => ({
      sourceId,
      sourceType,
      ...(path === undefined ? {} : { path }),
    }));

    return {
      schemaVersion: 1,
      transport: 'none',
      modelCalls: 0,
      review: {
        reviewId: draft.reviewId,
        deterministicFindingCount: draft.findings.filter(
          ({ authority }) => authority === 'DETERMINISTIC',
        ).length,
      },
      untrustedEvidence: { count: pointers.length, pointers },
    };
  } finally {
    store.close();
    await rm(root, { force: true, recursive: true });
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await createModelDataDryRunReport();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
