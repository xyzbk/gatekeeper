import { PassThrough } from 'node:stream';
import { access, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { StatusResponse } from '@gatekeeper/contracts';
import { describe, expect, it } from 'vitest';

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

async function createDashboardFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'gatekeeper-dashboard-'));
  await writeFile(join(root, 'index.html'), '<!doctype html><title>Gatekeeper</title>', 'utf8');
  return root;
}

async function buildTestServer(options: { logger?: unknown } = {}) {
  const [{ buildGatekeeperServer }, dashboardRoot] = await Promise.all([
    import('./server.js'),
    createDashboardFixture(),
  ]);

  return buildGatekeeperServer({
    bearerToken,
    dashboardRoot,
    getStatus: () => statusResponse,
    logger: options.logger ?? false,
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
      url: '/v1/repositories',
      headers: { host, authorization: `Bearer ${bearerToken}` },
    });
    await server.close();

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'The requested local resource was not found.' },
    });
  });

  it('bootstraps the token without caching and serves the dashboard', async () => {
    const server = await buildTestServer();

    const bootstrap = await server.inject({
      method: 'GET',
      url: '/bootstrap.json',
      headers: { host },
    });
    const dashboard = await server.inject({ method: 'GET', url: '/', headers: { host } });
    await server.close();

    expect(bootstrap.statusCode).toBe(200);
    expect(bootstrap.json()).toEqual({ apiBaseUrl: '/v1', bearerToken });
    expect(bootstrap.headers['cache-control']).toBe('no-store');
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.body).toContain('<title>Gatekeeper</title>');
  });

  it('registers JSON Schemas generated from shared contracts', async () => {
    const server = await buildTestServer();
    await server.ready();

    expect(server.getSchema('gatekeeper:health-response')).toBeDefined();
    expect(server.getSchema('gatekeeper:status-response-v1')).toBeDefined();
    expect(server.getSchema('gatekeeper:dashboard-bootstrap-v1')).toBeDefined();
    expect(server.getSchema('gatekeeper:error-envelope')).toBeDefined();
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
      startedAt: '2026-07-17T00:00:00.000Z',
      tools: statusResponse.tools,
      version: '0.1.0',
    });

    expect(service.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
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
