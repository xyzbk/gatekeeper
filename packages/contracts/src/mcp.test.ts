import { describe, expect, it } from 'vitest';

describe('gatekeeperMcpStatusSchema', () => {
  it('reports enough local state to decide whether indexing is stale', async () => {
    const { gatekeeperMcpStatusSchema } = await import('./mcp.js');
    const value = {
      schemaVersion: 1,
      status: {
        schemaVersion: 1,
        service: {
          state: 'ready',
          version: '0.1.0',
          startedAt: '2026-07-18T12:00:00.000Z',
          baseUrl: 'http://127.0.0.1:43127',
        },
        repository: {
          root: 'D:\\work\\gatekeeper',
          branch: 'master',
          head: 'b'.repeat(40),
          dirty: true,
          remote: null,
        },
        tools: {
          git: { available: true, version: 'git version 2.50.1' },
          gh: { available: false, version: null },
        },
        features: { modelReasoning: 'disabled', projectMemory: 'ready' },
        paths: {
          appData: 'C:\\Users\\developer\\AppData\\Local\\Gatekeeper',
          serviceMetadata: 'C:\\Users\\developer\\AppData\\Local\\Gatekeeper\\service.json',
          storage: 'C:\\Users\\developer\\AppData\\Local\\Gatekeeper\\storage',
        },
      },
      memory: {
        schemaVersion: 1,
        state: 'ready',
        repository: {
          schemaVersion: 1,
          repositoryId: 'repository_fixture',
          root: 'D:\\work\\gatekeeper',
          remote: null,
          createdAt: '2026-07-18T11:00:00.000Z',
          updatedAt: '2026-07-18T12:00:00.000Z',
        },
        indexState: {
          schemaVersion: 1,
          repositoryId: 'repository_fixture',
          head: 'a'.repeat(40),
          indexedAt: '2026-07-18T11:30:00.000Z',
          files: 4,
          documents: 3,
          commits: 2,
        },
      },
    };

    const parsed = gatekeeperMcpStatusSchema.parse(value);

    expect(parsed.status.repository.head).not.toBe(parsed.memory.indexState?.head);
  });
});
