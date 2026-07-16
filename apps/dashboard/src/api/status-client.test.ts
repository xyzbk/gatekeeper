import type { DashboardBootstrap, StatusResponse } from '@gatekeeper/contracts';
import { describe, expect, it, vi } from 'vitest';

const bearerToken = 'a'.repeat(43);
const bootstrap: DashboardBootstrap = { apiBaseUrl: '/v1', bearerToken };
const status: StatusResponse = {
  schemaVersion: 1,
  service: {
    state: 'ready',
    version: '0.1.0',
    startedAt: '2026-07-17T00:00:00.000Z',
    baseUrl: 'http://127.0.0.1:43127',
  },
  repository: {
    root: 'D:\\work\\gatekeeper',
    branch: 'master',
    head: 'b'.repeat(40),
    dirty: false,
    remote: 'https://github.com/xyzbk/gatekeeper.git',
  },
  tools: {
    git: { available: true, version: 'git version 2.50.1' },
    gh: { available: false, version: null },
  },
  features: { modelReasoning: 'disabled', projectMemory: 'not_initialized' },
  paths: {
    appData: 'C:\\Users\\developer\\AppData\\Local\\Gatekeeper',
    serviceMetadata: 'C:\\Users\\developer\\AppData\\Local\\Gatekeeper\\service.json',
    storage: 'C:\\Users\\developer\\AppData\\Local\\Gatekeeper\\storage',
  },
};

function jsonResponse(body: unknown, statusCode = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: statusCode,
  });
}

describe('status client', () => {
  it('keeps bootstrap in memory and sends the token only as an Authorization header', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(bootstrap))
      .mockResolvedValueOnce(jsonResponse(status));
    const { createStatusClient } = await import('./status-client.js');

    await expect(createStatusClient(fetcher).getStatus()).resolves.toEqual(status);

    expect(fetcher).toHaveBeenNthCalledWith(1, '/bootstrap.json', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    expect(fetcher).toHaveBeenNthCalledWith(2, '/v1/status', {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    expect(fetcher.mock.calls[1]?.[0]).not.toContain(bearerToken);
  });

  it('loads bootstrap once for repeated status requests', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(bootstrap))
      .mockImplementation(() => Promise.resolve(jsonResponse(status)));
    const { createStatusClient } = await import('./status-client.js');
    const client = createStatusClient(fetcher);

    await client.getStatus();
    await client.getStatus();

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.filter(([url]) => url === '/bootstrap.json')).toHaveLength(1);
  });

  it('rejects failed or malformed responses without exposing response content', async () => {
    const failedFetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, 500));
    const malformedFetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}));
    const { createStatusClient } = await import('./status-client.js');

    await expect(createStatusClient(failedFetcher).getStatus()).rejects.toThrow(
      'Gatekeeper bootstrap is unavailable.',
    );
    await expect(createStatusClient(malformedFetcher).getStatus()).rejects.toThrow(
      'Gatekeeper bootstrap returned an invalid response.',
    );
  });

  it('reports invalid JSON without echoing response content', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('private source content', {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );
    const { createStatusClient } = await import('./status-client.js');

    await expect(createStatusClient(fetcher).getStatus()).rejects.toThrow(
      'Gatekeeper bootstrap returned invalid JSON.',
    );
  });
});
