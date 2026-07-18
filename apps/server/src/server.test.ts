import { PassThrough } from 'node:stream';
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  IndexResult,
  IndexState,
  MemorySearchResult,
  RepositoryRecord,
  ReviewCompletionInput,
  ReviewDraftContract,
  ReviewRunContract,
  StatusResponse,
} from '@gatekeeper/contracts';
import { reviewRunSchema } from '@gatekeeper/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { ProjectMemoryApi } from './server.js';
import type { PersistentReviewContext } from './service.js';

const host = '127.0.0.1:43127';
const bearerToken = 'a'.repeat(43);
const repository = {
  root: 'D:\\work\\gatekeeper',
  branch: 'master',
  head: 'b'.repeat(40),
  dirty: false,
  remote: 'https://github.com/xyzbk/gatekeeper.git',
};

const statusResponse: StatusResponse = {
  schemaVersion: 1,
  service: {
    state: 'ready',
    version: '0.1.0',
    startedAt: '2026-07-17T00:00:00.000Z',
    baseUrl: `http://${host}`,
  },
  repository,
  tools: {
    git: { available: true, version: 'git version 2.50.1' },
    gh: { available: false, version: null },
  },
  features: {
    modelReasoning: 'disabled',
    projectMemory: 'not_initialized',
  },
  paths: {
    appData: 'C:\\Users\\developer\\AppData\\Local\\Gatekeeper',
    serviceMetadata: 'C:\\Users\\developer\\AppData\\Local\\Gatekeeper\\service.json',
    storage: 'C:\\Users\\developer\\AppData\\Local\\Gatekeeper\\storage',
  },
};

const reviewResponse: ReviewRunContract = {
  schemaVersion: 1,
  reviewId: 'review_api_test',
  repositoryId: 'repository_api_test',
  target: { kind: 'worktree', display: 'Current worktree' },
  verdict: 'FAST_PATH',
  summary: 'FAST_PATH: 1 changed file, 0 deterministic findings.',
  findings: [],
  metrics: {
    filesChanged: 1,
    linesAdded: 2,
    linesDeleted: 1,
    productionFilesChanged: 1,
    testFilesChanged: 0,
    documentationFilesChanged: 0,
    pathGroups: [{ name: 'src', count: 1 }],
  },
  changes: [
    {
      path: 'src/app.ts',
      status: 'modified',
      additions: 2,
      deletions: 1,
      binary: false,
      contentTruncated: false,
    },
  ],
  createdAt: '2026-07-18T12:00:00.000Z',
};

const repositoryRecord: RepositoryRecord = {
  schemaVersion: 1,
  repositoryId: reviewResponse.repositoryId,
  root: repository.root,
  remote: repository.remote,
  createdAt: '2026-07-18T11:00:00.000Z',
  updatedAt: '2026-07-18T11:00:00.000Z',
};

const indexState: IndexState = {
  schemaVersion: 1,
  repositoryId: repositoryRecord.repositoryId,
  head: repository.head,
  indexedAt: '2026-07-18T11:30:00.000Z',
  files: 4,
  documents: 3,
  commits: 2,
};

const indexResult: IndexResult = {
  ...indexState,
  files: { scanned: 4, written: 0, unchanged: 4, deleted: 0 },
  documents: { scanned: 3, written: 0, unchanged: 3, deleted: 0 },
  commits: { scanned: 2, written: 0, unchanged: 2, deleted: 0 },
};

const memoryResult: MemorySearchResult = {
  documentId: 'document_api_test',
  match: 'fts',
  trust: 'untrusted_repository_content',
  status: 'active',
  occurredAt: null,
  evidence: {
    sourceType: 'adr',
    repositoryId: repositoryRecord.repositoryId,
    sourceId: 'docs/adr/0003-no-redis.md',
    path: 'docs/adr/0003-no-redis.md',
    excerpt: 'Redis is not required for the local cache.',
  },
};

const reviewDraft: ReviewDraftContract = {
  schemaVersion: 1,
  reviewId: reviewResponse.reviewId,
  repositoryId: reviewResponse.repositoryId,
  target: reviewResponse.target,
  findings: reviewResponse.findings,
  metrics: reviewResponse.metrics,
  changes: reviewResponse.changes,
  evidenceCandidates: [memoryResult.evidence],
  createdAt: reviewResponse.createdAt,
};

const completionInput: ReviewCompletionInput = {
  schemaVersion: 1,
  findings: [
    {
      id: 'finding_inference',
      category: 'maintainability',
      severity: 'low',
      authority: 'INFERENCE',
      confidence: 0.65,
      title: 'A follow-up review may be useful',
      explanation: 'This is explicitly presented as an inference.',
      evidence: [],
      affectedPaths: ['src/app.ts'],
      remediation: ['Review the changed path manually.'],
      falsePositiveRisk: 'medium',
      humanApprovalRequired: false,
    },
  ],
  model: 'active-codex-model',
};

const completedReview: ReviewRunContract = {
  ...reviewResponse,
  findings: completionInput.findings,
  summary:
    'FAST_PATH: 1 changed file; 0 deterministic, 0 evidence-supported, 1 inference findings.',
  reasoningProvider: 'codex',
  model: 'active-codex-model',
};

async function createDashboardFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'gatekeeper-dashboard-'));
  await writeFile(join(root, 'index.html'), '<!doctype html><title>Gatekeeper</title>', 'utf8');
  return root;
}

async function buildTestServer(
  options: {
    completeReview?: (
      reviewId: string,
      input: ReviewCompletionInput,
    ) => Promise<ReviewRunContract | null>;
    logger?: unknown;
    prepareReview?: (reviewId: string) => Promise<ReviewDraftContract | null>;
    projectMemory?: Partial<ProjectMemoryApi>;
    reviewWorktree?: () => Promise<ReviewRunContract>;
  } = {},
) {
  const [{ buildGatekeeperServer }, dashboardRoot] = await Promise.all([
    import('./server.js'),
    createDashboardFixture(),
  ]);

  return buildGatekeeperServer({
    bearerToken,
    completeReview:
      options.completeReview ??
      ((reviewId) =>
        Promise.resolve(reviewId === reviewResponse.reviewId ? completedReview : null)),
    dashboardRoot,
    getStatus: () => statusResponse,
    logger: options.logger ?? false,
    projectMemory: {
      repository: repositoryRecord,
      getIndexState: () => Promise.resolve(indexState),
      getReview: (reviewId) =>
        Promise.resolve(reviewId === reviewResponse.reviewId ? reviewResponse : null),
      indexRepository: () => Promise.resolve(indexResult),
      searchMemory: () => Promise.resolve([memoryResult]),
      ...options.projectMemory,
    },
    prepareReview:
      options.prepareReview ??
      ((reviewId) => Promise.resolve(reviewId === reviewResponse.reviewId ? reviewDraft : null)),
    reviewWorktree: options.reviewWorktree ?? (() => Promise.resolve(reviewResponse)),
    version: '0.1.0',
  });
}

describe('Gatekeeper local service', () => {
  it('returns minimal unauthenticated health with restrictive headers', async () => {
    const server = await buildTestServer();

    const response = await server.inject({ method: 'GET', url: '/health', headers: { host } });
    await server.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', version: '0.1.0' });
    expect(response.body).not.toContain(repository.root);
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects invalid Host and Origin headers', async () => {
    const server = await buildTestServer();

    const invalidHost = await server.inject({
      method: 'GET',
      url: '/health',
      headers: { host: 'attacker.example' },
    });
    const invalidOrigin = await server.inject({
      method: 'GET',
      url: '/health',
      headers: { host, origin: 'https://attacker.example' },
    });
    const validOrigin = await server.inject({
      method: 'GET',
      url: '/health',
      headers: { host, origin: `http://${host}` },
    });
    await server.close();

    expect(invalidHost.statusCode).toBe(403);
    expect(invalidHost.json()).toEqual({
      error: { code: 'FORBIDDEN', message: 'The request Host is not allowed.' },
    });
    expect(invalidOrigin.statusCode).toBe(403);
    expect(validOrigin.statusCode).toBe(200);
  });

  it('requires the bearer token for status and returns no token', async () => {
    const server = await buildTestServer();

    const unauthorized = await server.inject({
      method: 'GET',
      url: '/v1/status',
      headers: { host },
    });
    const authorized = await server.inject({
      method: 'GET',
      url: '/v1/status',
      headers: { host, authorization: `Bearer ${bearerToken}` },
    });
    await server.close();

    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'A valid local bearer token is required.' },
    });
    expect(authorized.statusCode).toBe(200);
    expect(authorized.json()).toEqual(statusResponse);
    expect(authorized.body).not.toContain(bearerToken);
  });

  it('authenticates worktree review and returns the exact injected ReviewRun', async () => {
    const reviewWorktree = vi.fn(() => Promise.resolve(reviewResponse));
    const server = await buildTestServer({ reviewWorktree });

    const unauthorized = await server.inject({
      method: 'POST',
      url: '/v1/reviews/worktree',
      headers: { host },
      payload: {},
    });
    const authorized = await server.inject({
      method: 'POST',
      url: '/v1/reviews/worktree',
      headers: { host, authorization: `Bearer ${bearerToken}` },
      payload: {},
    });
    await server.close();

    expect(unauthorized.statusCode).toBe(401);
    expect(authorized.statusCode).toBe(200);
    expect(authorized.json()).toEqual(reviewResponse);
    expect(reviewWorktree).toHaveBeenCalledOnce();
  });

  it('rejects review path selectors and non-empty bodies before composition runs', async () => {
    const reviewWorktree = vi.fn(() => Promise.resolve(reviewResponse));
    const server = await buildTestServer({ reviewWorktree });
    const headers = { host, authorization: `Bearer ${bearerToken}` };

    const bodySelector = await server.inject({
      method: 'POST',
      url: '/v1/reviews/worktree',
      headers,
      payload: { path: 'C:\\private' },
    });
    const querySelector = await server.inject({
      method: 'POST',
      url: '/v1/reviews/worktree?path=C%3A%5Cprivate',
      headers,
      payload: {},
    });
    await server.close();

    expect(bodySelector.statusCode).toBe(400);
    expect(querySelector.statusCode).toBe(400);
    expect(bodySelector.body).not.toContain('C:\\private');
    expect(querySelector.body).not.toContain('C:\\private');
    expect(reviewWorktree).not.toHaveBeenCalled();
  });

  it('returns and logs only safe metadata when review composition fails', async () => {
    const stream = new PassThrough();
    let logs = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      logs += chunk;
    });
    const server = await buildTestServer({
      logger: { level: 'info', stream },
      reviewWorktree: () => Promise.reject(new Error('private source, diff, and token detail')),
    });

    const response = await server.inject({
      method: 'POST',
      url: '/v1/reviews/worktree',
      headers: { host, authorization: `Bearer ${bearerToken}` },
      payload: {},
    });
    await server.close();

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The local service could not complete the request.',
      },
    });
    expect(logs).toContain('POST /v1/reviews/worktree');
    expect(logs).not.toContain('private source');
    expect(logs).not.toContain(bearerToken);
  });

  it('rejects arbitrary path input with the shared error envelope', async () => {
    const server = await buildTestServer();

    const response = await server.inject({
      method: 'GET',
      url: '/v1/status?path=C%3A%5Cprivate',
      headers: { host, authorization: `Bearer ${bearerToken}` },
    });
    await server.close();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: 'USAGE_ERROR',
        message: 'The request does not match the local API contract.',
      },
    });
    expect(response.body).not.toContain('C:\\private');
  });

  it('returns the shared not-found envelope for unknown APIs', async () => {
    const server = await buildTestServer();

    const response = await server.inject({
      method: 'GET',
      url: '/v1/unknown',
      headers: { host, authorization: `Bearer ${bearerToken}` },
    });
    await server.close();

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'The requested local resource was not found.' },
    });
  });

  it('exposes only the fixed repository and rejects selectors in registration bodies', async () => {
    const server = await buildTestServer();
    const headers = { host, authorization: `Bearer ${bearerToken}` };

    const registered = await server.inject({
      method: 'POST',
      url: '/v1/repositories',
      headers,
      payload: {},
    });
    const selected = await server.inject({
      method: 'GET',
      url: `/v1/repositories/${repositoryRecord.repositoryId}`,
      headers,
    });
    const wrong = await server.inject({
      method: 'GET',
      url: '/v1/repositories/repository_other',
      headers,
    });
    const bodySelector = await server.inject({
      method: 'POST',
      url: '/v1/repositories',
      headers,
      payload: { path: 'C:\\private' },
    });
    await server.close();

    expect(registered.statusCode).toBe(200);
    expect(registered.json()).toEqual(repositoryRecord);
    expect(selected.json()).toEqual(repositoryRecord);
    expect(wrong.statusCode).toBe(404);
    expect(bodySelector.statusCode).toBe(400);
    expect(bodySelector.body).not.toContain('C:\\private');
  });

  it('indexes and reports memory status only for the fixed repository', async () => {
    const indexRepository = vi.fn(() => Promise.resolve(indexResult));
    const server = await buildTestServer({ projectMemory: { indexRepository } });
    const headers = { host, authorization: `Bearer ${bearerToken}` };

    const indexed = await server.inject({
      method: 'POST',
      url: `/v1/repositories/${repositoryRecord.repositoryId}/index`,
      headers,
      payload: {},
    });
    const status = await server.inject({
      method: 'GET',
      url: `/v1/repositories/${repositoryRecord.repositoryId}/memory/status`,
      headers,
    });
    const wrong = await server.inject({
      method: 'POST',
      url: '/v1/repositories/repository_other/index',
      headers,
      payload: {},
    });
    await server.close();

    expect(indexed.json()).toEqual(indexResult);
    expect(status.json()).toEqual({
      schemaVersion: 1,
      state: 'ready',
      repository: repositoryRecord,
      indexState,
    });
    expect(wrong.statusCode).toBe(404);
    expect(indexRepository).toHaveBeenCalledOnce();
  });

  it('strictly bounds memory search and contains it to the fixed repository', async () => {
    const searchMemory = vi.fn(() => Promise.resolve([memoryResult]));
    const server = await buildTestServer({ projectMemory: { searchMemory } });
    const headers = { host, authorization: `Bearer ${bearerToken}` };

    const found = await server.inject({
      method: 'POST',
      url: '/v1/memory/search',
      headers,
      payload: {
        schemaVersion: 1,
        repositoryId: repositoryRecord.repositoryId,
        query: 'redis cache',
        limit: 7,
      },
    });
    const wrongRepository = await server.inject({
      method: 'POST',
      url: '/v1/memory/search',
      headers,
      payload: { schemaVersion: 1, repositoryId: 'repository_other', query: 'redis cache' },
    });
    const invalidLimit = await server.inject({
      method: 'POST',
      url: '/v1/memory/search',
      headers,
      payload: {
        schemaVersion: 1,
        repositoryId: repositoryRecord.repositoryId,
        query: 'redis cache',
        limit: 51,
      },
    });
    await server.close();

    expect(found.statusCode).toBe(200);
    expect(found.json()).toEqual({ schemaVersion: 1, results: [memoryResult] });
    expect(wrongRepository.statusCode).toBe(404);
    expect(invalidLimit.statusCode).toBe(400);
    expect(searchMemory).toHaveBeenCalledOnce();
  });

  it('reads persisted reviews and returns a stable not-found response', async () => {
    const server = await buildTestServer();
    const headers = { host, authorization: `Bearer ${bearerToken}` };

    const found = await server.inject({
      method: 'GET',
      url: `/v1/reviews/${reviewResponse.reviewId}`,
      headers,
    });
    const missing = await server.inject({
      method: 'GET',
      url: '/v1/reviews/review_missing',
      headers,
    });
    await server.close();

    expect(found.json()).toEqual(reviewResponse);
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'The requested local resource was not found.' },
    });
  });

  it('returns a strict deterministic review draft with bounded evidence candidates', async () => {
    const prepareReview = vi.fn((reviewId: string) =>
      Promise.resolve(reviewId === reviewResponse.reviewId ? reviewDraft : null),
    );
    const server = await buildTestServer({ prepareReview });
    const headers = { host, authorization: `Bearer ${bearerToken}` };

    const found = await server.inject({
      method: 'GET',
      url: `/v1/reviews/${reviewResponse.reviewId}/draft`,
      headers,
    });
    const missing = await server.inject({
      method: 'GET',
      url: '/v1/reviews/review_missing/draft',
      headers,
    });
    await server.close();

    expect(found.statusCode).toBe(200);
    expect(found.json()).toEqual(reviewDraft);
    expect(missing.statusCode).toBe(404);
    expect(prepareReview).toHaveBeenCalledTimes(2);
  });

  it('strictly validates completion, rejects submitted authority, and returns the recomputed run', async () => {
    const completeReview = vi.fn(() => Promise.resolve(completedReview));
    const server = await buildTestServer({ completeReview });
    const headers = { host, authorization: `Bearer ${bearerToken}` };

    const completed = await server.inject({
      method: 'POST',
      url: `/v1/reviews/${reviewResponse.reviewId}/complete`,
      headers,
      payload: completionInput,
    });
    const submittedVerdict = await server.inject({
      method: 'POST',
      url: `/v1/reviews/${reviewResponse.reviewId}/complete`,
      headers,
      payload: { ...completionInput, verdict: 'BLOCK' },
    });
    const submittedDeterministicFinding = await server.inject({
      method: 'POST',
      url: `/v1/reviews/${reviewResponse.reviewId}/complete`,
      headers,
      payload: {
        ...completionInput,
        findings: [{ ...completionInput.findings[0], authority: 'DETERMINISTIC' }],
      },
    });
    await server.close();

    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toEqual(completedReview);
    expect(submittedVerdict.statusCode).toBe(400);
    expect(submittedDeterministicFinding.statusCode).toBe(400);
    expect(completeReview).toHaveBeenCalledOnce();
    expect(completeReview).toHaveBeenCalledWith(reviewResponse.reviewId, completionInput);
  });

  it('returns not found when completing an unknown review', async () => {
    const completeReview = vi.fn(() => Promise.resolve(null));
    const server = await buildTestServer({ completeReview });

    const response = await server.inject({
      method: 'POST',
      url: '/v1/reviews/review_missing/complete',
      headers: { host, authorization: `Bearer ${bearerToken}` },
      payload: { schemaVersion: 1, findings: [] },
    });
    await server.close();

    expect(response.statusCode).toBe(404);
  });

  it('maps Project Memory failures without logging source or database details', async () => {
    const stream = new PassThrough();
    let logs = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      logs += chunk;
    });
    const server = await buildTestServer({
      logger: { level: 'info', stream },
      projectMemory: {
        indexRepository: () => Promise.reject(new Error('private database and source detail')),
      },
    });

    const response = await server.inject({
      method: 'POST',
      url: `/v1/repositories/${repositoryRecord.repositoryId}/index`,
      headers: { host, authorization: `Bearer ${bearerToken}` },
      payload: {},
    });
    await server.close();

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('private database');
    expect(logs).not.toContain('private database');
  });

  it('bootstraps the token without caching and serves the dashboard', async () => {
    const server = await buildTestServer();

    const bootstrap = await server.inject({
      method: 'GET',
      url: '/bootstrap.json',
      headers: { host },
    });
    const dashboard = await server.inject({ method: 'GET', url: '/', headers: { host } });
    const reviewInspector = await server.inject({
      method: 'GET',
      url: '/reviews/worktree',
      headers: { host },
    });
    const memory = await server.inject({ method: 'GET', url: '/memory', headers: { host } });
    const storedReview = await server.inject({
      method: 'GET',
      url: '/reviews/review_api_test',
      headers: { host },
    });
    await server.close();

    expect(bootstrap.statusCode).toBe(200);
    expect(bootstrap.json()).toEqual({ apiBaseUrl: '/v1', bearerToken });
    expect(bootstrap.headers['cache-control']).toBe('no-store');
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.body).toContain('<title>Gatekeeper</title>');
    expect(reviewInspector.statusCode).toBe(200);
    expect(reviewInspector.body).toContain('<title>Gatekeeper</title>');
    expect(memory.statusCode).toBe(200);
    expect(memory.body).toContain('<title>Gatekeeper</title>');
    expect(storedReview.statusCode).toBe(200);
    expect(storedReview.body).toContain('<title>Gatekeeper</title>');
  });

  it('registers JSON Schemas generated from shared contracts', async () => {
    const server = await buildTestServer();
    await server.ready();

    expect(server.getSchema('gatekeeper:health-response')).toBeDefined();
    expect(server.getSchema('gatekeeper:status-response-v1')).toBeDefined();
    expect(server.getSchema('gatekeeper:dashboard-bootstrap-v1')).toBeDefined();
    expect(server.getSchema('gatekeeper:error-envelope')).toBeDefined();
    expect(server.getSchema('gatekeeper:review-run-v1')).toBeDefined();
    expect(server.getSchema('gatekeeper:review-draft-v1')).toBeDefined();
    expect(server.getSchema('gatekeeper:review-completion-input-v1')).toBeDefined();
    expect(server.getSchema('gatekeeper:repository-record-v1')).toBeDefined();
    expect(server.getSchema('gatekeeper:index-result-v1')).toBeDefined();
    expect(server.getSchema('gatekeeper:repository-status-v1')).toBeDefined();
    expect(server.getSchema('gatekeeper:memory-search-input-v1')).toBeDefined();
    expect(server.getSchema('gatekeeper:memory-search-response-v1')).toBeDefined();
    await server.close();
  });

  it('binds only to loopback and removes restrictive metadata on close', async () => {
    const appData = await mkdtemp(join(tmpdir(), 'gatekeeper-service-'));
    const storage = join(appData, 'storage');
    await mkdir(storage);
    const serviceMetadata = join(appData, 'service.json');
    const dashboardRoot = await createDashboardFixture();
    const { startGatekeeperService } = await import('./service.js');
    const service = await startGatekeeperService({
      bearerToken,
      dashboardRoot,
      logger: false,
      paths: { appData, serviceMetadata, storage },
      repository,
      reviewWorktree: ({ repositoryId, previousReviewId }) =>
        Promise.resolve({
          ...reviewResponse,
          repositoryId,
          ...(previousReviewId === undefined ? {} : { previousReviewId }),
        }),
      startedAt: '2026-07-17T00:00:00.000Z',
      tools: statusResponse.tools,
      version: '0.1.0',
    });

    expect(service.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(service.status.features.projectMemory).toBe('ready');
    expect(service.server.addresses()).toEqual([expect.objectContaining({ address: '127.0.0.1' })]);
    expect(JSON.parse(await readFile(serviceMetadata, 'utf8'))).toEqual({
      schemaVersion: 1,
      pid: process.pid,
      port: Number(new URL(service.baseUrl).port),
      baseUrl: service.baseUrl,
      bearerToken,
      repositoryRoot: repository.root,
      startedAt: '2026-07-17T00:00:00.000Z',
    });
    if (process.platform !== 'win32') {
      expect((await stat(serviceMetadata)).mode & 0o777).toBe(0o600);
    }

    await service.close();
    await expect(access(serviceMetadata)).rejects.toThrow();
  });

  it('persists a review before response and reads it after a complete service restart', async () => {
    const appData = await mkdtemp(join(tmpdir(), 'gatekeeper-restart-'));
    const paths = {
      appData,
      serviceMetadata: join(appData, 'service.json'),
      storage: join(appData, 'storage'),
    };
    const dashboardRoot = await createDashboardFixture();
    const { startGatekeeperService } = await import('./service.js');
    let sequence = 0;
    const reviewWorktree = vi.fn(({ repositoryId, previousReviewId }: PersistentReviewContext) => {
      sequence += 1;
      return Promise.resolve({
        ...reviewResponse,
        reviewId: `review_restart_${sequence}`,
        repositoryId,
        ...(previousReviewId === undefined ? {} : { previousReviewId }),
      });
    });

    try {
      const first = await startGatekeeperService({
        bearerToken,
        dashboardRoot,
        logger: false,
        paths,
        repository,
        reviewWorktree,
        startedAt: '2026-07-17T00:00:00.000Z',
        tools: statusResponse.tools,
        version: '0.1.0',
      });
      const firstReviewResponse = await first.server.inject({
        method: 'POST',
        url: '/v1/reviews/worktree',
        headers: { host: new URL(first.baseUrl).host, authorization: `Bearer ${bearerToken}` },
        payload: {},
      });
      const firstReview = reviewRunSchema.parse(firstReviewResponse.json());
      await first.close();

      const second = await startGatekeeperService({
        bearerToken,
        dashboardRoot,
        logger: false,
        paths,
        repository,
        reviewWorktree,
        startedAt: '2026-07-17T01:00:00.000Z',
        tools: statusResponse.tools,
        version: '0.1.0',
      });
      const headers = {
        host: new URL(second.baseUrl).host,
        authorization: `Bearer ${bearerToken}`,
      };
      const persisted = await second.server.inject({
        method: 'GET',
        url: `/v1/reviews/${firstReview.reviewId}`,
        headers,
      });
      const secondReviewResponse = await second.server.inject({
        method: 'POST',
        url: '/v1/reviews/worktree',
        headers,
        payload: {},
      });
      const secondReview = reviewRunSchema.parse(secondReviewResponse.json());
      await second.close();

      expect(firstReviewResponse.statusCode).toBe(200);
      expect(persisted.statusCode).toBe(200);
      expect(persisted.json()).toEqual(firstReview);
      expect(secondReview.previousReviewId).toBe(firstReview.reviewId);
      expect(reviewWorktree).toHaveBeenCalledTimes(2);
    } finally {
      await rm(appData, { force: true, recursive: true });
    }
  });

  it('prepares, validates, persists, and reloads a completed Codex review', async () => {
    const appData = await mkdtemp(join(tmpdir(), 'gatekeeper-completion-'));
    const paths = {
      appData,
      serviceMetadata: join(appData, 'service.json'),
      storage: join(appData, 'storage'),
    };
    const dashboardRoot = await createDashboardFixture();
    const { startGatekeeperService } = await import('./service.js');
    const reviewWorktree = ({ repositoryId }: PersistentReviewContext) =>
      Promise.resolve({ ...reviewResponse, repositoryId });

    try {
      const first = await startGatekeeperService({
        bearerToken,
        dashboardRoot,
        logger: false,
        paths,
        repository,
        reviewWorktree,
        startedAt: '2026-07-17T00:00:00.000Z',
        tools: statusResponse.tools,
        version: '0.1.0',
      });
      const headers = {
        host: new URL(first.baseUrl).host,
        authorization: `Bearer ${bearerToken}`,
      };
      const createdResponse = await first.server.inject({
        method: 'POST',
        url: '/v1/reviews/worktree',
        headers,
        payload: {},
      });
      const created = reviewRunSchema.parse(createdResponse.json());
      const draft = await first.server.inject({
        method: 'GET',
        url: `/v1/reviews/${created.reviewId}/draft`,
        headers,
      });
      const completedResponse = await first.server.inject({
        method: 'POST',
        url: `/v1/reviews/${created.reviewId}/complete`,
        headers,
        payload: completionInput,
      });
      const completed = reviewRunSchema.parse(completedResponse.json());
      const forged = await first.server.inject({
        method: 'POST',
        url: `/v1/reviews/${created.reviewId}/complete`,
        headers,
        payload: {
          schemaVersion: 1,
          findings: [
            {
              ...completionInput.findings[0],
              authority: 'EVIDENCE_SUPPORTED',
              evidence: [memoryResult.evidence],
            },
          ],
        },
      });
      await first.close();

      const second = await startGatekeeperService({
        bearerToken,
        dashboardRoot,
        logger: false,
        paths,
        repository,
        reviewWorktree,
        startedAt: '2026-07-17T01:00:00.000Z',
        tools: statusResponse.tools,
        version: '0.1.0',
      });
      const persisted = await second.server.inject({
        method: 'GET',
        url: `/v1/reviews/${created.reviewId}`,
        headers: {
          host: new URL(second.baseUrl).host,
          authorization: `Bearer ${bearerToken}`,
        },
      });
      await second.close();

      expect(draft.statusCode).toBe(200);
      expect(draft.json()).toEqual(
        expect.objectContaining({
          reviewId: created.reviewId,
          findings: [],
          evidenceCandidates: [],
          changes: created.changes,
        }),
      );
      expect(completedResponse.statusCode).toBe(200);
      expect(completed.reasoningProvider).toBe('codex');
      expect(completed.findings).toEqual(completionInput.findings);
      expect(forged.statusCode).toBe(400);
      expect(forged.json()).toEqual({
        error: {
          code: 'USAGE_ERROR',
          message: 'The request does not match the local API contract.',
        },
      });
      expect(persisted.statusCode).toBe(200);
      expect(persisted.json()).toEqual(completed);
    } finally {
      await rm(appData, { force: true, recursive: true });
    }
  });

  it('logs operational metadata without tokens or repository paths', async () => {
    const stream = new PassThrough();
    let logs = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      logs += chunk;
    });
    const server = await buildTestServer({ logger: { level: 'info', stream } });

    await server.inject({
      method: 'GET',
      url: '/v1/status',
      headers: { host, authorization: `Bearer ${bearerToken}` },
    });
    await server.inject({
      method: 'GET',
      url: '/missing?private=detail',
      headers: { host },
    });
    await server.close();

    expect(logs).toContain('GET /v1/status');
    expect(logs).toContain('GET unmatched-route');
    expect(logs).toContain('durationMs');
    expect(logs).not.toContain('GET undefined');
    expect(logs).not.toContain('private=detail');
    expect(logs).not.toContain(bearerToken);
    expect(logs).not.toContain(repository.root);
  });
});
