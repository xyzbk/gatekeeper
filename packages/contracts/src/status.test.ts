import { describe, expect, it } from 'vitest';

const repository = {
  root: 'D:\\work\\gatekeeper',
  branch: 'master',
  head: 'a'.repeat(40),
  dirty: false,
  remote: 'https://github.com/xyzbk/gatekeeper.git',
};

const status = {
  schemaVersion: 1,
  service: {
    state: 'ready',
    version: '0.1.0',
    startedAt: '2026-07-17T00:00:00.000Z',
    baseUrl: 'http://127.0.0.1:43127',
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

describe('Phase 1 service contracts', () => {
  it('accepts the complete real status shape', async () => {
    const { statusResponseSchema } = await import('./status.js');

    expect(statusResponseSchema.parse(status)).toEqual(status);
    expect(
      statusResponseSchema.parse({
        ...status,
        features: { ...status.features, projectMemory: 'ready' },
      }).features.projectMemory,
    ).toBe('ready');
  });

  it('rejects unknown status and repository fields', async () => {
    const { repositorySnapshotSchema, statusResponseSchema } = await import('./status.js');

    expect(() => repositorySnapshotSchema.parse({ ...repository, path: 'unexpected' })).toThrow();
    expect(() => statusResponseSchema.parse({ ...status, token: 'must-not-leak' })).toThrow();
  });

  it('keeps health free of repository details', async () => {
    const { healthResponseSchema } = await import('./status.js');

    expect(healthResponseSchema.parse({ status: 'ok', version: '0.1.0' })).toEqual({
      status: 'ok',
      version: '0.1.0',
    });
    expect(() =>
      healthResponseSchema.parse({ status: 'ok', version: '0.1.0', repository }),
    ).toThrow();
  });

  it('requires a loopback service URL and a strong bootstrap token', async () => {
    const { dashboardBootstrapSchema, serviceMetadataSchema } = await import('./status.js');
    const bearerToken = 'a'.repeat(43);

    expect(dashboardBootstrapSchema.parse({ apiBaseUrl: '/v1', bearerToken })).toEqual({
      apiBaseUrl: '/v1',
      bearerToken,
    });

    expect(() =>
      serviceMetadataSchema.parse({
        schemaVersion: 1,
        pid: 42,
        port: 43127,
        baseUrl: 'http://0.0.0.0:43127',
        bearerToken,
        repositoryRoot: repository.root,
        startedAt: '2026-07-17T00:00:00.000Z',
      }),
    ).toThrow();
  });

  it('generates strict Fastify JSON schemas from Zod', async () => {
    const { healthResponseJsonSchema, statusResponseJsonSchema } = await import('./status.js');

    expect(healthResponseJsonSchema.additionalProperties).toBe(false);
    expect(statusResponseJsonSchema.additionalProperties).toBe(false);
    expect(statusResponseJsonSchema.required).toContain('repository');
  });
});
